/**
 * Channel Partner Portal — session infrastructure (Module 4, Req 7, 21).
 *
 * The Channel Portal authenticates partners with email + password, completely
 * independent of the internal Realzentic dashboard auth (Req 7.1). Its session
 * is carried by its OWN signed cookie (`cp_session`) so the two auth domains
 * never overlap: a dashboard session grants nothing in the portal and vice
 * versa.
 *
 * The cookie is a stateless, HMAC-signed token `payload.signature` where the
 * payload is the partner principal (`partnerId`, `email`, `expiresAt`). The
 * signature is verified with a constant-time comparison on every read, so a
 * partner cannot forge or tamper with their `partnerId` — every authenticated
 * query is then scoped to that signed `partnerId` (Req 7.3, 7.4, 21.2). This
 * mirrors the established internal `lib/session.ts` HMAC-cookie scheme and uses
 * the Web Crypto API so it works in the edge runtime as well as Node.
 *
 * NOTE: this file is intentionally NOT a `'use server'` module — it exports
 * synchronous utilities alongside async helpers, which a `'use server'` module
 * may not do. The login/logout server actions live in
 * `app/actions/channel-portal.ts`.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/** Cookie that carries the signed channel-partner session token. */
export const CP_SESSION_COOKIE = 'cp_session'

/** Where unauthenticated partners are sent (Req 7.8, 21.1). */
export const CP_LOGIN_PATH = '/channel-portal/login'

/** Session lifetime: 7 days, matching the internal dashboard session. */
export const CP_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * Secret used to sign the cookie. Shares `SESSION_SECRET` with the rest of the
 * app; the distinct cookie name and payload shape keep the portal session
 * independent of the dashboard session (Req 7.1).
 */
const CP_SESSION_SECRET =
    process.env.SESSION_SECRET || 'default-secret-at-least-32-chars-long'

/** The authenticated channel-partner principal derived from a valid cookie. */
export interface CpSessionPayload {
    /** ChannelPartner row id — the scope for every portal query (Req 7.3, 21.2). */
    partnerId: number
    /** The partner's login email (for display / audit). */
    email: string
    /** Epoch-ms when the session expires. */
    expiresAt: number
}

// ─── Edge-compatible base64url + HMAC (mirrors lib/session.ts) ───────────────

function b64urlEncode(str: string): string {
    if (typeof Buffer !== 'undefined') return Buffer.from(str).toString('base64url')
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(str: string): string {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64url').toString('utf8')
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
    return atob(b64)
}

async function sign(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    const uint8View = new Uint8Array(signature)
    return typeof Buffer !== 'undefined'
        ? Buffer.from(uint8View).toString('base64url')
        : btoa(String.fromCharCode(...uint8View))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '')
}

/** Constant-time string compare so signature checks don't leak timing. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    return result === 0
}

// ─── Token encode / decode ───────────────────────────────────────────────────

/** Encode + sign a partner principal into the `payload.signature` cookie value. */
export async function encodeCpSession(payload: CpSessionPayload): Promise<string> {
    const data = b64urlEncode(JSON.stringify(payload))
    const signature = await sign(data, CP_SESSION_SECRET)
    return `${data}.${signature}`
}

/**
 * Verify and decode a cookie value. Returns the principal only when the
 * signature is valid AND the session has not expired; otherwise `null`
 * (missing, malformed, tampered, or expired) so the caller forces a re-login.
 */
export async function decodeCpSession(
    token: string | undefined,
    now: number = Date.now()
): Promise<CpSessionPayload | null> {
    if (!token) return null

    const [data, signature] = token.split('.')
    if (!data || !signature) return null

    const expected = await sign(data, CP_SESSION_SECRET)
    if (!timingSafeEqual(signature, expected)) return null

    try {
        const payload = JSON.parse(b64urlDecode(data)) as CpSessionPayload
        if (
            typeof payload.partnerId !== 'number' ||
            typeof payload.expiresAt !== 'number' ||
            payload.expiresAt < now
        ) {
            return null
        }
        return payload
    } catch {
        return null
    }
}

// ─── Cookie transport ─────────────────────────────────────────────────────────

/**
 * Establish a channel-partner session: sign the principal and store it in an
 * httpOnly cookie scoped to the whole app, expiring with the session TTL.
 */
export async function setCpSessionCookie(
    partnerId: number,
    email: string,
    now: number = Date.now()
): Promise<void> {
    const expiresAt = now + CP_SESSION_TTL_SECONDS * 1000
    const token = await encodeCpSession({ partnerId, email, expiresAt })
    const cookieStore = await cookies()
    cookieStore.set(CP_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(expiresAt),
    })
}

/** Remove the channel-partner session cookie (logout). */
export async function clearCpSessionCookie(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete(CP_SESSION_COOKIE)
}

// ─── Session resolution & guard ────────────────────────────────────────────────

/**
 * Resolve the current channel-partner session from the request cookie. Returns
 * the {@link CpSessionPayload} when the cookie is present, validly signed, and
 * unexpired; otherwise `null`.
 */
export async function getCpSession(now: number = Date.now()): Promise<CpSessionPayload | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get(CP_SESSION_COOKIE)?.value
    return decodeCpSession(token, now)
}

/**
 * Server-component guard: return the partner session or redirect to the portal
 * login when the request is unauthenticated or the session has expired
 * (Req 7.8, 21.1). Use at the top of every protected `app/channel-portal/`
 * page so unauthenticated requests never reach partner data.
 */
export async function requireChannelPartnerAuth(): Promise<CpSessionPayload> {
    const session = await getCpSession()
    if (!session) redirect(CP_LOGIN_PATH)
    return session
}
