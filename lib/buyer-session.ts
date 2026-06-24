/**
 * Buyer Self-Service Portal — session & lockout infrastructure (Module 15).
 *
 * This module holds the *stateful* / IO pieces that back the buyer portal's
 * authentication, deliberately kept separate from the PURE, property-tested
 * helpers in `lib/buyer-auth.ts` (which never touch the clock, DB, cookies, or
 * any shared state):
 *
 *   - the DB-backed 24-hour session token read/validation (Req 18.5, 18.7);
 *   - the signed-cookie transport for that token;
 *   - the 5-attempt / 15-minute per-phone login lockout (Req 18.4); and
 *   - `requireBuyerAuth`, the server-component guard that redirects an
 *     unauthenticated request to the buyer login (Req 21.1).
 *
 * The cookie holds an opaque random token; the authoritative session lives in
 * the `BuyerSession` row keyed by that token, so a buyer cannot forge a session
 * and every authenticated query is scoped to the row's `contactId` (Req 18.6,
 * 21.2).
 *
 * NOTE: this file is intentionally NOT a `'use server'` module. It exports both
 * async helpers and a couple of synchronous utilities used by the server
 * actions in `app/actions/buyer-portal.ts`; a `'use server'` module may only
 * export async functions.
 */

import { randomBytes, randomInt } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { sessionExpired, DEFAULT_SESSION_TTL_SECONDS } from '@/lib/buyer-auth'

/** Cookie that carries the opaque buyer session token. */
export const BUYER_SESSION_COOKIE = 'buyer_session'

/** Where unauthenticated buyers are sent (Req 21.1). */
export const BUYER_LOGIN_PATH = '/buyer-portal/login'

/** Max consecutive failed OTP attempts before a phone is locked (Req 18.4). */
export const MAX_OTP_ATTEMPTS = 5

/** Lockout duration once {@link MAX_OTP_ATTEMPTS} is reached (Req 18.4). */
export const LOCKOUT_MS = 15 * 60 * 1000

/** OTP request budget per phone within {@link LOCKOUT_MS} (anti-spam, Req 18.2). */
export const OTP_REQUEST_LIMIT = 5

// ─── OTP / token generation ──────────────────────────

/**
 * Generate a cryptographically-random 6-digit OTP (Req 18.2). Uses
 * `crypto.randomInt` for uniform, unpredictable codes; the value is
 * zero-padded so codes like `000123` keep their six digits.
 */
export function generateBuyerOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Generate an opaque, unguessable buyer session token (Req 18.5). */
export function generateSessionToken(): string {
    return randomBytes(32).toString('hex')
}

// ─── Per-phone login lockout (Req 18.4) ──────────────
//
// Fixed-failure counter with a sliding lock, mirroring the in-memory approach
// of `lib/rate-limit.ts`: a single Node process holds the Map, which is fine
// for a single-instance VPS deployment. Scale beyond one instance by swapping
// the Map for Redis while keeping these function signatures.

interface AttemptState {
    /** Consecutive failures recorded in the current window. */
    failures: number
    /** Epoch-ms when the phone is unlocked again, or null when not locked. */
    lockedUntil: number | null
}

const attempts = new Map<string, AttemptState>()

// Opportunistic cleanup so expired locks don't accumulate; no background timer
// (works in serverless edge runtimes that don't keep timers alive).
const LIGHT_SWEEP_EVERY = 1000
let callsSinceSweep = 0

function sweepExpired(now: number) {
    for (const [k, v] of attempts) {
        if (v.lockedUntil !== null && now >= v.lockedUntil) attempts.delete(k)
    }
}

/** Result of a lockout check. */
export interface LockoutStatus {
    locked: boolean
    /** Milliseconds until the lock lifts (0 when not locked). */
    retryAfterMs: number
}

/**
 * Whether `key` (a normalized phone) is currently locked out (Req 18.4).
 * Reading the state never consumes an attempt. Expired locks are cleared.
 */
export function isLockedOut(key: string, now: number = Date.now()): LockoutStatus {
    callsSinceSweep += 1
    if (callsSinceSweep >= LIGHT_SWEEP_EVERY) {
        callsSinceSweep = 0
        sweepExpired(now)
    }

    const state = attempts.get(key)
    if (!state || state.lockedUntil === null) return { locked: false, retryAfterMs: 0 }

    if (now >= state.lockedUntil) {
        // Lock has elapsed — reset so the buyer gets a fresh budget.
        attempts.delete(key)
        return { locked: false, retryAfterMs: 0 }
    }

    return { locked: true, retryAfterMs: state.lockedUntil - now }
}

/**
 * Record one failed OTP attempt for `key`. The 5th consecutive failure locks
 * the phone for {@link LOCKOUT_MS} (Req 18.4). Returns the resulting status so
 * callers can surface the lockout immediately rather than on the next attempt.
 */
export function recordFailedAttempt(key: string, now: number = Date.now()): LockoutStatus {
    let state = attempts.get(key)
    if (!state || (state.lockedUntil !== null && now >= state.lockedUntil)) {
        state = { failures: 0, lockedUntil: null }
        attempts.set(key, state)
    }

    state.failures += 1
    if (state.failures >= MAX_OTP_ATTEMPTS) {
        state.lockedUntil = now + LOCKOUT_MS
        return { locked: true, retryAfterMs: LOCKOUT_MS }
    }
    return { locked: false, retryAfterMs: 0 }
}

/** Clear the failure counter for `key` after a successful login (Req 18.4). */
export function clearFailedAttempts(key: string): void {
    attempts.delete(key)
}

/** Test-only helper: wipe all lockout state so unit tests don't leak across files. */
export function __resetBuyerLockoutForTests(): void {
    attempts.clear()
    callsSinceSweep = 0
}

// ─── Session cookie transport ────────────────────────

/**
 * Persist the buyer session token in an httpOnly cookie scoped to the whole
 * app so it accompanies every buyer-portal request and server action. The
 * cookie expires with the 24-hour session lifetime (Req 18.5, 18.7).
 */
export async function setBuyerSessionCookie(token: string, createdAt: Date): Promise<void> {
    const cookieStore = await cookies()
    const expires = new Date(createdAt.getTime() + DEFAULT_SESSION_TTL_SECONDS * 1000)
    cookieStore.set(BUYER_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires,
    })
}

/** Remove the buyer session cookie (logout). */
export async function clearBuyerSessionCookie(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete(BUYER_SESSION_COOKIE)
}

// ─── Session resolution & guard ──────────────────────

/** The authenticated buyer principal derived from a valid session. */
export interface BuyerAuthContext {
    /** BuyerSession row id. */
    sessionId: number
    /** The contact the session belongs to — the scope for every query. */
    contactId: number
    /** Normalized phone the session was issued for. */
    phone: string
}

/**
 * Resolve the current buyer session from the request cookie (Req 18.5, 18.7).
 *
 * Returns the {@link BuyerAuthContext} when the cookie names a `BuyerSession`
 * that is verified and still within its 24-hour lifetime; otherwise returns
 * `null` (no cookie, unknown token, unverified, or expired). Expired sessions
 * are treated as unauthenticated so the caller forces re-authentication
 * (Req 18.7).
 */
export async function getBuyerSession(now: Date = new Date()): Promise<BuyerAuthContext | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get(BUYER_SESSION_COOKIE)?.value
    if (!token) return null

    const session = await prisma.buyerSession.findUnique({
        where: { sessionToken: token },
        select: { id: true, contactId: true, phone: true, verified: true, createdAt: true },
    })

    if (!session || !session.verified) return null
    if (sessionExpired(session.createdAt, now)) return null

    return { sessionId: session.id, contactId: session.contactId, phone: session.phone }
}

/**
 * Server-component guard: return the buyer session or redirect to the buyer
 * login when the request is unauthenticated or the session has expired
 * (Req 21.1, 18.7). Use at the top of every protected `app/buyer-portal/` page.
 */
export async function requireBuyerAuth(): Promise<BuyerAuthContext> {
    const session = await getBuyerSession()
    if (!session) redirect(BUYER_LOGIN_PATH)
    return session
}
