/**
 * Property-based tests for the Buyer Self-Service Portal pure auth/validation
 * helpers (`lib/buyer-auth.ts`).
 *
 * Implements design correctness properties 62, 63, 65 and 66 using `fast-check`
 * on the Vitest runner. Each property runs the project default of 100 iterations
 * via {@link fcAssert} and carries the required property-tag comment:
 *
 *   // Feature: real-estate-crm, Property N: <text>
 *
 * Requirements:
 *   - 18.2, 21.3 — OTP expiry window + 6-digit format (Property 62).
 *   - 18.3       — OTP login rejection on expiry/mismatch (Property 63).
 *   - 18.7       — Buyer session expiry after 24 hours (Property 65).
 *   - 18.9       — Support-ticket required-field validation (Property 66).
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
    otpExpired,
    isValidOtpFormat,
    otpAccepted,
    sessionExpired,
    validateSupportTicket,
    DEFAULT_OTP_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
    SUPPORT_TICKET_SUBJECT_MIN,
    SUPPORT_TICKET_SUBJECT_MAX,
    SUPPORT_TICKET_DESCRIPTION_MIN,
    SUPPORT_TICKET_DESCRIPTION_MAX,
    type SupportTicketInput,
} from '@/lib/buyer-auth'
import { fcAssert } from '@/test/generators'

// ---------------------------------------------------------------------------
// Local arbitraries
// ---------------------------------------------------------------------------

/**
 * An epoch-milliseconds instant in a realistic, finite range (roughly
 * 2001-09-09 .. 2033-05-18). Kept well within safe-integer bounds so that
 * `now - generatedAt` never loses precision.
 */
const epochMsArb: fc.Arbitrary<number> = fc.integer({
    min: 1_000_000_000_000,
    max: 2_000_000_000_000,
})

/** A non-negative elapsed time, in seconds, spanning both sides of any TTL. */
const elapsedSecondsArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 200_000 })

/** Exactly 6 ASCII digits — a syntactically valid OTP. */
const validOtpArb: fc.Arbitrary<string> = fc
    .integer({ min: 0, max: 999_999 })
    .map((n) => String(n).padStart(6, '0'))

/**
 * A string that is NOT a valid 6-digit OTP: wrong length, or containing a
 * non-digit. Used to characterize the format guard.
 */
const invalidOtpArb: fc.Arbitrary<string> = fc.oneof(
    fc.stringMatching(/^[0-9]{0,5}$/), // too short (0..5 digits)
    fc.stringMatching(/^[0-9]{7,10}$/), // too long (7..10 digits)
    fc.string({ minLength: 6, maxLength: 6 }).filter((s) => !/^[0-9]{6}$/.test(s)),
)

// ---------------------------------------------------------------------------
// Property 62: OTP expiry window (Req 18.2, 21.3)
// ---------------------------------------------------------------------------

describe('Property 62: OTP expiry window', () => {
    // Feature: real-estate-crm, Property 62: For any OTP generation time and current time, the OTP is expired if and only if the elapsed time exceeds 300 seconds, and a generated OTP consists of 6 digits.
    it('expires iff elapsed exceeds the 300s TTL, and a valid OTP is exactly 6 digits', () => {
        fcAssert(
            fc.property(epochMsArb, elapsedSecondsArb, (generatedAtMs, elapsedSeconds) => {
                const nowMs = generatedAtMs + elapsedSeconds * 1000

                // expired iff elapsed strictly exceeds the default 300s window.
                const expected = elapsedSeconds > DEFAULT_OTP_TTL_SECONDS
                expect(otpExpired(generatedAtMs, nowMs)).toBe(expected)
                expect(otpExpired(new Date(generatedAtMs), new Date(nowMs), 300)).toBe(expected)
            }),
        )
    })

    // Feature: real-estate-crm, Property 62: For any OTP generation time and current time, the OTP is expired if and only if the elapsed time exceeds 300 seconds, and a generated OTP consists of 6 digits.
    it('boundary: valid exactly at the TTL, expired one second past it', () => {
        fcAssert(
            fc.property(epochMsArb, (generatedAtMs) => {
                const atBoundary = generatedAtMs + DEFAULT_OTP_TTL_SECONDS * 1000
                expect(otpExpired(generatedAtMs, atBoundary)).toBe(false)
                expect(otpExpired(generatedAtMs, atBoundary + 1000)).toBe(true)
                // Clock skew (now before generation) is treated as not expired.
                expect(otpExpired(generatedAtMs, generatedAtMs - 1000)).toBe(false)
            }),
        )
    })

    // Feature: real-estate-crm, Property 62: For any OTP generation time and current time, the OTP is expired if and only if the elapsed time exceeds 300 seconds, and a generated OTP consists of 6 digits.
    it('a generated OTP is accepted by the format guard iff it is exactly 6 digits', () => {
        fcAssert(
            fc.property(validOtpArb, (otp) => {
                expect(otp).toHaveLength(6)
                expect(isValidOtpFormat(otp)).toBe(true)
            }),
        )
        fcAssert(
            fc.property(invalidOtpArb, (otp) => {
                expect(isValidOtpFormat(otp)).toBe(false)
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 63: OTP login rejection (Req 18.3)
// ---------------------------------------------------------------------------

describe('Property 63: OTP login rejection', () => {
    // Feature: real-estate-crm, Property 63: For any OTP submission, login is rejected if the OTP is expired or does not match the generated OTP.
    it('rejects when the OTP is expired or mismatched; accepts only a matching, unexpired OTP', () => {
        fcAssert(
            fc.property(
                validOtpArb,
                validOtpArb,
                epochMsArb,
                elapsedSecondsArb,
                (storedOtp, submittedOtp, generatedAtMs, elapsedSeconds) => {
                    const nowMs = generatedAtMs + elapsedSeconds * 1000
                    const matches = storedOtp === submittedOtp
                    const expired = elapsedSeconds > DEFAULT_OTP_TTL_SECONDS

                    const accepted = otpAccepted(storedOtp, submittedOtp, generatedAtMs, nowMs)

                    // Accepted iff it matches AND is not expired; otherwise rejected.
                    expect(accepted).toBe(matches && !expired)
                    if (expired || !matches) {
                        expect(accepted).toBe(false)
                    }
                },
            ),
        )
    })

    // Feature: real-estate-crm, Property 63: For any OTP submission, login is rejected if the OTP is expired or does not match the generated OTP.
    it('rejects when there is no valid stored OTP or the submission is malformed', () => {
        fcAssert(
            fc.property(
                fc.option(invalidOtpArb, { nil: null }),
                fc.string(),
                epochMsArb,
                (storedOtp, submittedOtp, generatedAtMs) => {
                    // Stored OTP is absent/malformed → never accepted, regardless of submission.
                    expect(
                        otpAccepted(storedOtp, submittedOtp, generatedAtMs, generatedAtMs),
                    ).toBe(false)
                },
            ),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 65: Buyer session expiry (Req 18.7)
// ---------------------------------------------------------------------------

describe('Property 65: Buyer session expiry', () => {
    // Feature: real-estate-crm, Property 65: For any session creation time and current time, the session is expired if and only if the elapsed time exceeds 24 hours (86,400 seconds), and access via an expired token is denied pending re-authentication.
    it('expires iff elapsed exceeds the 24h (86,400s) TTL', () => {
        fcAssert(
            fc.property(epochMsArb, elapsedSecondsArb, (createdAtMs, elapsedSeconds) => {
                const nowMs = createdAtMs + elapsedSeconds * 1000
                const expected = elapsedSeconds > DEFAULT_SESSION_TTL_SECONDS
                expect(sessionExpired(createdAtMs, nowMs)).toBe(expected)
                expect(sessionExpired(new Date(createdAtMs), new Date(nowMs), 86_400)).toBe(expected)
            }),
        )
    })

    // Feature: real-estate-crm, Property 65: For any session creation time and current time, the session is expired if and only if the elapsed time exceeds 24 hours (86,400 seconds), and access via an expired token is denied pending re-authentication.
    it('boundary: valid exactly at 24h, expired one second past it; clock skew is not expired', () => {
        fcAssert(
            fc.property(epochMsArb, (createdAtMs) => {
                const atBoundary = createdAtMs + DEFAULT_SESSION_TTL_SECONDS * 1000
                expect(sessionExpired(createdAtMs, atBoundary)).toBe(false)
                expect(sessionExpired(createdAtMs, atBoundary + 1000)).toBe(true)
                expect(sessionExpired(createdAtMs, createdAtMs - 1000)).toBe(false)
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 66: Support ticket required-field validation (Req 18.9)
// ---------------------------------------------------------------------------

/** A whitespace-padded string of a given trimmed length, for boundary tests. */
const paddedStringArb = (trimmedLength: number): fc.Arbitrary<string> =>
    fc
        .tuple(
            fc.stringMatching(/^[ \t\n]{0,5}$/),
            fc.stringMatching(/^[ \t\n]{0,5}$/),
        )
        .map(([lead, trail]) => lead + 'a'.repeat(trimmedLength) + trail)

/** A valid contactId: a positive integer. */
const contactIdArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 1_000_000 })

describe('Property 66: Support ticket required-field validation', () => {
    // Feature: real-estate-crm, Property 66: For any support-ticket creation input missing a required field, creation is rejected with an error; an input with all required fields present is persisted.
    it('a fully valid input is accepted with no errors', () => {
        fcAssert(
            fc.property(
                contactIdArb,
                fc.integer({ min: SUPPORT_TICKET_SUBJECT_MIN, max: SUPPORT_TICKET_SUBJECT_MAX }),
                fc.integer({
                    min: SUPPORT_TICKET_DESCRIPTION_MIN,
                    max: SUPPORT_TICKET_DESCRIPTION_MAX,
                }),
                (contactId, subjectLen, descLen) => {
                    const result = validateSupportTicket({
                        contactId,
                        subject: 'a'.repeat(subjectLen),
                        description: 'a'.repeat(descLen),
                    })
                    expect(result.valid).toBe(true)
                    expect(result.errors).toHaveLength(0)
                },
            ),
        )
    })

    // Feature: real-estate-crm, Property 66: For any support-ticket creation input missing a required field, creation is rejected with an error; an input with all required fields present is persisted.
    it('an input missing any required field is rejected with at least one error', () => {
        const missingContactArb: fc.Arbitrary<SupportTicketInput['contactId']> = fc.oneof(
            fc.constant<null>(null),
            fc.constant<undefined>(undefined),
            fc.integer({ min: -1_000, max: 0 }), // non-positive
            fc.double({ min: 0.1, max: 0.9, noNaN: true }), // non-integer
        )
        const missingTextArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
            fc.constant<null>(null),
            fc.constant<undefined>(undefined),
            fc.constant(''),
            fc.stringMatching(/^[ \t\n]{1,6}$/), // whitespace-only → trims to empty
        )

        fcAssert(
            fc.property(
                fc.record({
                    contactId: fc.oneof(contactIdArb, missingContactArb),
                    subject: fc.oneof(
                        fc.constant('valid subject'),
                        missingTextArb,
                    ),
                    description: fc.oneof(
                        fc.constant('a valid description'),
                        missingTextArb,
                    ),
                }),
                (input) => {
                    const contactOk =
                        typeof input.contactId === 'number' &&
                        Number.isInteger(input.contactId) &&
                        input.contactId > 0
                    const subjectOk =
                        typeof input.subject === 'string' &&
                        input.subject.trim().length >= SUPPORT_TICKET_SUBJECT_MIN
                    const descOk =
                        typeof input.description === 'string' &&
                        input.description.trim().length >= SUPPORT_TICKET_DESCRIPTION_MIN

                    const allPresent = contactOk && subjectOk && descOk
                    const result = validateSupportTicket(input as SupportTicketInput)

                    expect(result.valid).toBe(allPresent)
                    if (!allPresent) {
                        expect(result.errors.length).toBeGreaterThan(0)
                    }
                },
            ),
        )
    })

    // Feature: real-estate-crm, Property 66: For any support-ticket creation input missing a required field, creation is rejected with an error; an input with all required fields present is persisted.
    it('rejects fields that exceed their maximum length (boundary characterization)', () => {
        fcAssert(
            fc.property(
                contactIdArb,
                fc.boolean(),
                fc.boolean(),
                (contactId, overSubject, overDesc) => {
                    const subjectLen = overSubject
                        ? SUPPORT_TICKET_SUBJECT_MAX + 1
                        : SUPPORT_TICKET_SUBJECT_MAX
                    const descLen = overDesc
                        ? SUPPORT_TICKET_DESCRIPTION_MAX + 1
                        : SUPPORT_TICKET_DESCRIPTION_MAX
                    const result = validateSupportTicket({
                        contactId,
                        subject: 'a'.repeat(subjectLen),
                        description: 'a'.repeat(descLen),
                    })
                    expect(result.valid).toBe(!overSubject && !overDesc)
                },
            ),
        )
    })

    // Feature: real-estate-crm, Property 66: For any support-ticket creation input missing a required field, creation is rejected with an error; an input with all required fields present is persisted.
    it('trims surrounding whitespace before measuring required lengths', () => {
        fcAssert(
            fc.property(contactIdArb, paddedStringArb(1), paddedStringArb(1), (contactId, subject, description) => {
                const result = validateSupportTicket({ contactId, subject, description })
                // Trimmed content has length 1 (>= min) → valid.
                expect(result.valid).toBe(true)
            }),
        )
    })
})
