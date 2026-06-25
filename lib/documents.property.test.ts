/**
 * Property-based tests for the Document Management & KYC pure helpers
 * (`lib/documents.ts`).
 *
 * Covers design Properties 33–35 (Tasks 12.2–12.4) using fast-check with the
 * Vitest runner. Example-based unit tests live alongside in `documents.test.ts`.
 */
import { describe, it } from 'vitest'
import fc from 'fast-check'
import {
    ALLOWED_MIME_TYPES,
    MAX_UPLOAD_BYTES,
    MIN_UPLOAD_BYTES,
    daysUntilExpiry,
    extractMergeFields,
    isWithinExpiryWindow,
    resolveMergeFields,
    validateUpload,
    type UploadRejectionReason,
} from './documents'

const NUM_RUNS = 100

/** Milliseconds in one day (mirrors the private constant in documents.ts). */
const MS_PER_DAY = 24 * 60 * 60 * 1000

// Feature: real-estate-crm, Property 33: Upload accepted within size and type bounds
// Validates: Requirements 8.2, 8.3
describe('Property 33: Upload accepted within size and type bounds', () => {
    it('accepts any file within [1B, 25MB] and an allowed type', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: MIN_UPLOAD_BYTES, max: MAX_UPLOAD_BYTES }),
                fc.constantFrom(...ALLOWED_MIME_TYPES),
                (sizeBytes, mimeType) => {
                    const result = validateUpload(sizeBytes, mimeType)
                    return result.ok === true && result.reason === undefined
                }
            ),
            { numRuns: NUM_RUNS }
        )
    })

    it('rejects any oversized file (> 25MB) with TOO_LARGE', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: MAX_UPLOAD_BYTES + 1, max: Number.MAX_SAFE_INTEGER }),
                fc.constantFrom(...ALLOWED_MIME_TYPES),
                (sizeBytes, mimeType) => {
                    const result = validateUpload(sizeBytes, mimeType)
                    const reason: UploadRejectionReason = 'TOO_LARGE'
                    return result.ok === false && result.reason === reason
                }
            ),
            { numRuns: NUM_RUNS }
        )
    })

    it('rejects any disallowed type (within size bounds) with DISALLOWED_TYPE', () => {
        const disallowedType = fc
            .string()
            .filter(
                (s) =>
                    !(ALLOWED_MIME_TYPES as readonly string[]).includes(
                        s.trim().toLowerCase()
                    )
            )
        fc.assert(
            fc.property(
                fc.integer({ min: MIN_UPLOAD_BYTES, max: MAX_UPLOAD_BYTES }),
                disallowedType,
                (sizeBytes, mimeType) => {
                    const result = validateUpload(sizeBytes, mimeType)
                    const reason: UploadRejectionReason = 'DISALLOWED_TYPE'
                    return result.ok === false && result.reason === reason
                }
            ),
            { numRuns: NUM_RUNS }
        )
    })

    it('rejects empty files (< 1 byte) with a size reason', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -1_000_000, max: MIN_UPLOAD_BYTES - 1 }),
                fc.constantFrom(...ALLOWED_MIME_TYPES),
                (sizeBytes, mimeType) => {
                    const result = validateUpload(sizeBytes, mimeType)
                    return result.ok === false && result.reason === 'EMPTY_FILE'
                }
            ),
            { numRuns: NUM_RUNS }
        )
    })
})

// Feature: real-estate-crm, Property 34: Template generation requires all merge fields
// Validates: Requirements 8.6
describe('Property 34: Template generation requires all merge fields', () => {
    // Safe field-name pool: identifiers free of brace/whitespace edge cases.
    const FIELD_POOL = [
        'name',
        'city',
        'unit',
        'price',
        'date',
        'agent',
        'email',
        'phone',
        'project',
        'amount',
    ]

    // A value that counts as "present" (anything not null/undefined).
    const presentValue = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant('')
    )

    it('succeeds iff every merge field in the body resolves to a value', () => {
        fc.assert(
            fc.property(
                // Unique subset of fields referenced by the template body.
                fc.uniqueArray(fc.constantFrom(...FIELD_POOL), { minLength: 0, maxLength: FIELD_POOL.length }),
                // For each pooled field, decide its presence/value in the value map.
                fc.dictionary(
                    fc.constantFrom(...FIELD_POOL),
                    fc.oneof(presentValue, fc.constant(null), fc.constant(undefined))
                ),
                (templateFields, values) => {
                    const body =
                        'Dear customer, ' +
                        templateFields.map((f) => `{{${f}}}`).join(' and ') +
                        ' — thank you.'

                    // Expected unresolved fields, in first-appearance order.
                    const expectedMissing = templateFields.filter((f) => {
                        const v = (values as Record<string, unknown>)[f]
                        return v === undefined || v === null
                    })

                    const result = resolveMergeFields(body, values)

                    // ok iff there are no missing fields.
                    if (result.ok !== (expectedMissing.length === 0)) return false

                    if (result.ok) {
                        // On success: fully substituted, no placeholders remain.
                        if (result.missing !== undefined) return false
                        if (result.resolved === undefined) return false
                        return !/\{\{.*?\}\}/.test(result.resolved)
                    }

                    // On failure: report exactly the unresolved fields, no substitution.
                    if (result.resolved !== undefined) return false
                    return (
                        JSON.stringify(result.missing) ===
                        JSON.stringify(expectedMissing)
                    )
                }
            ),
            { numRuns: NUM_RUNS }
        )
    })

    it('every reported missing field is actually referenced and unresolved', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.constantFrom(...FIELD_POOL), { minLength: 1, maxLength: FIELD_POOL.length }),
                fc.dictionary(
                    fc.constantFrom(...FIELD_POOL),
                    fc.oneof(presentValue, fc.constant(null), fc.constant(undefined))
                ),
                (templateFields, values) => {
                    const body = templateFields.map((f) => `{{${f}}}`).join(', ')
                    const referenced = new Set(extractMergeFields(body))
                    const result = resolveMergeFields(body, values)
                    if (result.ok) return result.missing === undefined
                    return (result.missing ?? []).every((f) => {
                        const v = (values as Record<string, unknown>)[f]
                        return referenced.has(f) && (v === undefined || v === null)
                    })
                }
            ),
            { numRuns: NUM_RUNS }
        )
    })
})

// Feature: real-estate-crm, Property 35: Document expiry alert window
// Validates: Requirements 8.7
describe('Property 35: Document expiry alert window', () => {
    it('alerts iff days until expiry is in [0, window] inclusive', () => {
        fc.assert(
            fc.property(
                fc.date({
                    min: new Date('2000-01-01T00:00:00Z'),
                    max: new Date('2100-01-01T00:00:00Z'),
                    noInvalidDate: true,
                }),
                // Window in the configurable range.
                fc.integer({ min: 1, max: 365 }),
                // Day offset spanning before today, inside, and beyond the window.
                fc.integer({ min: -50, max: 420 }),
                // Arbitrary within-day offset so day-flooring is exercised.
                fc.integer({ min: 0, max: MS_PER_DAY - 1 }),
                (now, windowDays, targetDays, withinDayMs) => {
                    const nowDay = Math.floor(now.getTime() / MS_PER_DAY)
                    const expiry = new Date(
                        (nowDay + targetDays) * MS_PER_DAY + withinDayMs
                    )

                    // Construction guarantees daysUntilExpiry === targetDays.
                    if (daysUntilExpiry(expiry, now) !== targetDays) return false

                    const expectedAlert = targetDays >= 0 && targetDays <= windowDays
                    return isWithinExpiryWindow(expiry, now, windowDays) === expectedAlert
                }
            ),
            { numRuns: NUM_RUNS }
        )
    })
})
