import crypto from 'node:crypto'

/**
 * Verify the HMAC-SHA256 signature Meta attaches to webhook POSTs.
 *
 * Meta signs the raw request body with your App Secret and sends the
 * result in the `x-hub-signature-256: sha256=<hex>` header. Without
 * verification, anyone who knows our webhook URL can POST fabricated
 * status updates and drift broadcast counts arbitrarily.
 *
 * Reference:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify-payloads
 *
 * The App Secret is supplied by the caller — it now comes from the
 * per-account WhatsApp config (set in the WhatsApp Marketing settings
 * UI, stored encrypted) with `META_APP_SECRET` kept as an env fallback.
 * See `resolveWhatsAppWebhookSecret` / `verifyWhatsAppWebhookSignature`
 * in `./webhook-secret` for the resolution + multi-candidate matching.
 *
 * Contract:
 *   The secret is **required**. If it's missing/empty we fail closed —
 *   the request is rejected. A previous version fell open with a warning
 *   log, which is unsafe: anyone who forgot to configure the secret
 *   would be running a fully spoofable webhook.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | null | undefined,
): boolean {
  // Fail CLOSED when no secret is configured. Without it we cannot
  // verify authenticity, so the request must be rejected.
  if (!secret) return false

  if (!signatureHeader) return false
  if (!signatureHeader.startsWith('sha256=')) return false

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  // Bail if lengths differ — timingSafeEqual throws otherwise.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
