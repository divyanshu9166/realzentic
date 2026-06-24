/**
 * Unit tests for the buyer-portal session infrastructure (Task 25.6).
 *
 * Covers the stateful 5-attempt / 15-minute login lockout (Req 18.4) and the
 * OTP/token generators. The DB-backed session resolution and cookie transport
 * are exercised through integration of the server actions; here we focus on the
 * deterministic, clock-injectable lockout logic.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
    LOCKOUT_MS,
    MAX_OTP_ATTEMPTS,
    __resetBuyerLockoutForTests,
    clearFailedAttempts,
    generateBuyerOtp,
    generateSessionToken,
    isLockedOut,
    recordFailedAttempt,
} from './buyer-session'

afterEach(() => {
    __resetBuyerLockoutForTests()
})

describe('login lockout (Req 18.4)', () => {
    const phone = '919876543210'
    const t0 = 1_700_000_000_000

    it('is not locked before any failures', () => {
        expect(isLockedOut(phone, t0).locked).toBe(false)
    })

    it('does not lock before the 5th consecutive failure', () => {
        for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) {
            const status = recordFailedAttempt(phone, t0)
            expect(status.locked).toBe(false)
        }
        expect(isLockedOut(phone, t0).locked).toBe(false)
    })

    it('locks for 15 minutes on the 5th consecutive failure', () => {
        let status = { locked: false, retryAfterMs: 0 }
        for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
            status = recordFailedAttempt(phone, t0)
        }
        expect(status.locked).toBe(true)
        expect(status.retryAfterMs).toBe(LOCKOUT_MS)
        expect(isLockedOut(phone, t0).locked).toBe(true)
    })

    it('remains locked until the window elapses, then resets', () => {
        for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) recordFailedAttempt(phone, t0)

        // One ms before the window ends: still locked.
        expect(isLockedOut(phone, t0 + LOCKOUT_MS - 1).locked).toBe(true)
        // At the window boundary: unlocked and state cleared.
        expect(isLockedOut(phone, t0 + LOCKOUT_MS).locked).toBe(false)
        // A fresh failure starts a brand-new budget.
        expect(recordFailedAttempt(phone, t0 + LOCKOUT_MS).locked).toBe(false)
    })

    it('clears the counter on a successful login', () => {
        for (let i = 0; i < MAX_OTP_ATTEMPTS - 1; i++) recordFailedAttempt(phone, t0)
        clearFailedAttempts(phone)
        // After clearing, it takes the full MAX_OTP_ATTEMPTS again to lock.
        let status = { locked: false, retryAfterMs: 0 }
        for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) status = recordFailedAttempt(phone, t0)
        expect(status.locked).toBe(true)
    })

    it('tracks phones independently', () => {
        const other = '919000000000'
        for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) recordFailedAttempt(phone, t0)
        expect(isLockedOut(phone, t0).locked).toBe(true)
        expect(isLockedOut(other, t0).locked).toBe(false)
    })
})

describe('generators', () => {
    it('generateBuyerOtp returns exactly six digits', () => {
        for (let i = 0; i < 200; i++) {
            expect(generateBuyerOtp()).toMatch(/^[0-9]{6}$/)
        }
    })

    it('generateSessionToken returns a long, unique hex token', () => {
        const a = generateSessionToken()
        const b = generateSessionToken()
        expect(a).toMatch(/^[0-9a-f]{64}$/)
        expect(a).not.toBe(b)
    })
})
