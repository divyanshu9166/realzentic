/**
 * Unit tests for the Buyer Self-Service Portal pure helpers
 * (`lib/buyer-auth.ts`, Task 25.1).
 *
 * Example-based tests covering core behaviour and edge cases. The numbered
 * design Properties (62, 63, 65, 66) are implemented separately as
 * property-based tests in their own tasks (25.2–25.5).
 */
import { describe, expect, it } from 'vitest'
import {
    DEFAULT_OTP_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
    isValidOtpFormat,
    otpAccepted,
    otpExpired,
    sessionExpired,
    validateSupportTicket,
} from './buyer-auth'

const base = new Date('2024-01-15T00:00:00.000Z')
const plusSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000)

describe('otpExpired', () => {
    it('is not expired immediately after generation', () => {
        expect(otpExpired(base, base)).toBe(false)
    })

    it('is not expired exactly at the ttl boundary (300s)', () => {
        expect(otpExpired(base, plusSeconds(base, DEFAULT_OTP_TTL_SECONDS))).toBe(false)
    })

    it('is expired one second past the ttl boundary', () => {
        expect(otpExpired(base, plusSeconds(base, DEFAULT_OTP_TTL_SECONDS + 1))).toBe(true)
    })

    it('treats clock skew (now before generatedAt) as not expired', () => {
        expect(otpExpired(base, plusSeconds(base, -10))).toBe(false)
    })

    it('honours a custom ttl', () => {
        expect(otpExpired(base, plusSeconds(base, 60), 60)).toBe(false)
        expect(otpExpired(base, plusSeconds(base, 61), 60)).toBe(true)
    })

    it('accepts epoch-ms numbers as well as Dates', () => {
        expect(otpExpired(base.getTime(), base.getTime() + 301_000)).toBe(true)
    })

    it('rejects a negative ttl', () => {
        expect(() => otpExpired(base, base, -1)).toThrow()
    })
})

describe('isValidOtpFormat', () => {
    it('accepts exactly six digits', () => {
        expect(isValidOtpFormat('000000')).toBe(true)
        expect(isValidOtpFormat('123456')).toBe(true)
        expect(isValidOtpFormat('999999')).toBe(true)
    })

    it('rejects wrong lengths', () => {
        expect(isValidOtpFormat('12345')).toBe(false)
        expect(isValidOtpFormat('1234567')).toBe(false)
        expect(isValidOtpFormat('')).toBe(false)
    })

    it('rejects non-digit characters and whitespace', () => {
        expect(isValidOtpFormat('12 456')).toBe(false)
        expect(isValidOtpFormat('12345a')).toBe(false)
        expect(isValidOtpFormat('+12345')).toBe(false)
        expect(isValidOtpFormat(' 123456 ')).toBe(false)
    })

    it('rejects non-string inputs', () => {
        expect(isValidOtpFormat(123456)).toBe(false)
        expect(isValidOtpFormat(null)).toBe(false)
        expect(isValidOtpFormat(undefined)).toBe(false)
    })
})

describe('otpAccepted', () => {
    it('accepts a matching, valid, unexpired OTP', () => {
        expect(otpAccepted('123456', '123456', base, plusSeconds(base, 10))).toBe(true)
    })

    it('rejects a mismatched OTP', () => {
        expect(otpAccepted('123456', '654321', base, base)).toBe(false)
    })

    it('rejects an expired (but matching) OTP', () => {
        expect(otpAccepted('123456', '123456', base, plusSeconds(base, 301))).toBe(false)
    })

    it('rejects when no OTP was issued', () => {
        expect(otpAccepted(null, '123456', base, base)).toBe(false)
        expect(otpAccepted(undefined, '123456', base, base)).toBe(false)
    })

    it('rejects a malformed stored OTP', () => {
        expect(otpAccepted('abc', 'abc', base, base)).toBe(false)
    })
})

describe('sessionExpired', () => {
    it('is not expired immediately after creation', () => {
        expect(sessionExpired(base, base)).toBe(false)
    })

    it('is not expired exactly at the 24-hour boundary', () => {
        expect(sessionExpired(base, plusSeconds(base, DEFAULT_SESSION_TTL_SECONDS))).toBe(false)
    })

    it('is expired one second past the 24-hour boundary', () => {
        expect(sessionExpired(base, plusSeconds(base, DEFAULT_SESSION_TTL_SECONDS + 1))).toBe(true)
    })

    it('treats clock skew (now before createdAt) as not expired', () => {
        expect(sessionExpired(base, plusSeconds(base, -100))).toBe(false)
    })

    it('rejects a negative ttl', () => {
        expect(() => sessionExpired(base, base, -1)).toThrow()
    })
})

describe('validateSupportTicket', () => {
    const valid = {
        contactId: 42,
        subject: 'Leaking tap in master bathroom',
        description: 'The tap has been dripping continuously since possession.',
    }

    it('accepts a fully populated, in-bounds ticket', () => {
        const result = validateSupportTicket(valid)
        expect(result.valid).toBe(true)
        expect(result.errors).toEqual([])
    })

    it('rejects a missing contactId', () => {
        const result = validateSupportTicket({ ...valid, contactId: null })
        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes('contactId'))).toBe(true)
    })

    it('rejects a non-positive contactId', () => {
        expect(validateSupportTicket({ ...valid, contactId: 0 }).valid).toBe(false)
        expect(validateSupportTicket({ ...valid, contactId: -1 }).valid).toBe(false)
    })

    it('rejects an empty or whitespace-only subject', () => {
        expect(validateSupportTicket({ ...valid, subject: '' }).valid).toBe(false)
        expect(validateSupportTicket({ ...valid, subject: '   ' }).valid).toBe(false)
        expect(validateSupportTicket({ ...valid, subject: null }).valid).toBe(false)
    })

    it('rejects a subject longer than 200 characters', () => {
        expect(validateSupportTicket({ ...valid, subject: 'a'.repeat(201) }).valid).toBe(false)
    })

    it('accepts subject at the 200-character boundary', () => {
        expect(validateSupportTicket({ ...valid, subject: 'a'.repeat(200) }).valid).toBe(true)
    })

    it('rejects an empty description', () => {
        expect(validateSupportTicket({ ...valid, description: '' }).valid).toBe(false)
        expect(validateSupportTicket({ ...valid, description: null }).valid).toBe(false)
    })

    it('rejects a description longer than 5000 characters', () => {
        expect(validateSupportTicket({ ...valid, description: 'a'.repeat(5001) }).valid).toBe(false)
    })

    it('accepts description at the 5000-character boundary', () => {
        expect(validateSupportTicket({ ...valid, description: 'a'.repeat(5000) }).valid).toBe(true)
    })

    it('reports every problem at once', () => {
        const result = validateSupportTicket({ contactId: null, subject: '', description: '' })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBe(3)
    })
})
