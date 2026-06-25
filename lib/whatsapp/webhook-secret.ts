import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/whatsapp/encryption'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature'

/**
 * Resolve every Meta App Secret that could legitimately have signed an
 * inbound WhatsApp webhook POST.
 *
 * Sources, in order:
 *   1. The `app_secret` column of every saved WhatsApp config (decrypted).
 *      This is what the operator enters in the WhatsApp Marketing settings
 *      UI — the primary, no-redeploy way to configure the secret.
 *   2. The `META_APP_SECRET` env var, kept as a backward-compatible
 *      fallback for deployments that configured it before the UI existed.
 *
 * The signature is verified on the raw request bytes *before* we can know
 * which account a payload belongs to, so we collect all candidates and
 * accept the request if any one of them matches (mirrors how the GET
 * handshake matches `verify_token` across all configs).
 *
 * Returns a de-duplicated, non-empty-string list. An empty result means
 * no secret is configured anywhere — callers must then fail closed.
 */
export async function resolveWhatsAppWebhookSecrets(): Promise<string[]> {
    const secrets = new Set<string>()

    const envSecret = process.env.META_APP_SECRET
    if (envSecret) secrets.add(envSecret)

    try {
        const configs = await prisma.waWhatsappConfig.findMany({
            where: { app_secret: { not: null } },
            select: { app_secret: true },
        })
        for (const { app_secret } of configs) {
            if (!app_secret) continue
            try {
                const plain = decrypt(app_secret)
                if (plain) secrets.add(plain)
            } catch {
                // A row encrypted with a different/rotated ENCRYPTION_KEY — skip
                // it rather than letting one bad row break verification for all.
            }
        }
    } catch (error) {
        // DB unavailable: fall back to whatever the env provided. Never throw
        // out of the verification path.
        console.warn(
            '[webhook] could not load app secrets from DB:',
            error instanceof Error ? error.message : error,
        )
    }

    return [...secrets]
}

/**
 * Verify an inbound WhatsApp webhook POST against every configured App
 * Secret. Fails closed (returns false) when no secret is configured.
 */
export async function verifyWhatsAppWebhookSignature(
    rawBody: string,
    signatureHeader: string | null,
): Promise<boolean> {
    const secrets = await resolveWhatsAppWebhookSecrets()
    if (secrets.length === 0) {
        console.warn(
            '[webhook] no Meta App Secret configured (set it in WhatsApp ' +
            'Marketing → Settings, or via META_APP_SECRET) — rejecting ' +
            'all webhook requests until one is provided.',
        )
        return false
    }
    return secrets.some((secret) =>
        verifyMetaWebhookSignature(rawBody, signatureHeader, secret),
    )
}
