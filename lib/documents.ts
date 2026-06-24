/**
 * Document Management & KYC pure helpers.
 *
 * Every export here is a PURE function (no DB/IO, no clock access — the
 * "current time" is always passed in by the caller). They back the
 * `Document_Service` server actions in `app/actions/documents.ts`:
 *
 *   - {@link validateUpload}     — size (1 byte … 25 MB) and MIME allow-list
 *                                  gate for uploads          (Req 8.2, 8.3).
 *   - {@link resolveMergeFields} — verifies every `{{field}}` placeholder in a
 *                                  template body resolves to a value before a
 *                                  document is generated      (Req 8.6).
 *   - {@link isWithinExpiryWindow} — expiry-alert predicate: true iff the days
 *                                  until expiry fall in `[0, window]` (Req 8.7).
 */

/** Inclusive minimum accepted upload size: 1 byte (Req 8.2). */
export const MIN_UPLOAD_BYTES = 1
/** Inclusive maximum accepted upload size: 25 MB (Req 8.2, 8.3). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Allow-list of accepted document MIME types (Req 8.3). Covers the document
 * formats a real-estate workflow uploads: PDFs, scanned images of KYC / legal
 * documents, and common office documents.
 */
export const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/tiff',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

/** Default document-expiry alert window in days (Req 8.7). */
export const DEFAULT_EXPIRY_WINDOW_DAYS = 30
/** Inclusive minimum configurable expiry alert window in days (Req 8.7). */
export const MIN_EXPIRY_WINDOW_DAYS = 1
/** Inclusive maximum configurable expiry alert window in days (Req 8.7). */
export const MAX_EXPIRY_WINDOW_DAYS = 365

/** Milliseconds in one day, used for day-difference arithmetic. */
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Reason codes returned when an upload is rejected. */
export type UploadRejectionReason =
    | 'EMPTY_FILE'
    | 'TOO_LARGE'
    | 'INVALID_SIZE'
    | 'DISALLOWED_TYPE'

/**
 * Result of {@link validateUpload}. `ok` is `true` only when the file is both
 * within the size bounds and of an accepted type; otherwise `reason` identifies
 * why the upload was rejected (Req 8.3 — "return an error identifying the
 * reason").
 */
export interface UploadValidationResult {
    ok: boolean
    reason?: UploadRejectionReason
}

/**
 * Validate an upload's size and MIME type against the accepted bounds.
 *
 * Accepted when the size is in the inclusive range `[1, 25 MB]` AND the MIME
 * type is on {@link ALLOWED_MIME_TYPES}. Size is checked before type so an
 * empty/oversized file reports the size problem first.
 *
 * @param sizeBytes File size in bytes.
 * @param mimeType  Declared MIME type of the file.
 * @returns `{ ok: true }` when accepted, otherwise `{ ok: false, reason }`.
 *
 * Requirements: 8.2 (accept within bounds), 8.3 (reject with reason).
 */
export function validateUpload(
    sizeBytes: number,
    mimeType: string
): UploadValidationResult {
    if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes)) {
        return { ok: false, reason: 'INVALID_SIZE' }
    }
    if (sizeBytes < MIN_UPLOAD_BYTES) {
        return { ok: false, reason: 'EMPTY_FILE' }
    }
    if (sizeBytes > MAX_UPLOAD_BYTES) {
        return { ok: false, reason: 'TOO_LARGE' }
    }
    if (!isAllowedMimeType(mimeType)) {
        return { ok: false, reason: 'DISALLOWED_TYPE' }
    }
    return { ok: true }
}

/**
 * Type guard: is `mimeType` on the accepted allow-list? Comparison is
 * case-insensitive and tolerant of surrounding whitespace.
 */
export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
    if (typeof mimeType !== 'string') return false
    const normalized = mimeType.trim().toLowerCase()
    return (ALLOWED_MIME_TYPES as readonly string[]).includes(normalized)
}

/**
 * Matches `{{ fieldName }}` merge placeholders. Field names are any run of
 * characters that is not `{` or `}`; surrounding whitespace inside the braces
 * is ignored. The `g` flag is required for `matchAll`.
 */
const MERGE_FIELD_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g

/**
 * Extract the distinct merge-field names referenced by a template body, in the
 * order of first appearance.
 *
 * @param templateBody The template HTML/text containing `{{field}}` placeholders.
 * @returns The unique, trimmed field names found in the body.
 */
export function extractMergeFields(templateBody: string): string[] {
    if (typeof templateBody !== 'string' || templateBody.length === 0) {
        return []
    }
    const seen = new Set<string>()
    for (const match of templateBody.matchAll(MERGE_FIELD_PATTERN)) {
        const name = match[1].trim()
        if (name.length > 0) seen.add(name)
    }
    return [...seen]
}

/** Result of {@link resolveMergeFields}. */
export interface MergeFieldResolution {
    /** `true` iff every placeholder in the body resolves to a value. */
    ok: boolean
    /** Field names present in the body but absent from `values` (only when `!ok`). */
    missing?: string[]
    /** The body with every placeholder substituted (only when `ok`). */
    resolved?: string
}

/**
 * Resolve a template body against a map of merge values.
 *
 * Succeeds **if and only if** every merge field in the body has a corresponding
 * value in `values` (a value is "present" when the key exists and is neither
 * `null` nor `undefined`). On success the fully substituted body is returned;
 * on failure the unresolved field names are reported and no substitution is
 * performed (Req 8.6 — "reject generation and return an error identifying the
 * unresolved field").
 *
 * @param templateBody The template HTML/text containing `{{field}}` placeholders.
 * @param values       A map of field name → value (numbers/booleans are stringified).
 * @returns `{ ok: true, resolved }` or `{ ok: false, missing }`.
 *
 * Requirements: 8.6.
 */
export function resolveMergeFields(
    templateBody: string,
    values: Record<string, unknown> | null | undefined
): MergeFieldResolution {
    const fields = extractMergeFields(templateBody)
    const valueMap = values ?? {}

    const missing = fields.filter((field) => {
        const value = valueMap[field]
        return value === undefined || value === null
    })

    if (missing.length > 0) {
        return { ok: false, missing }
    }

    const resolved = templateBody.replace(MERGE_FIELD_PATTERN, (_match, raw: string) => {
        const name = raw.trim()
        return String(valueMap[name])
    })

    return { ok: true, resolved }
}

/**
 * Whole-day difference from `now` until `expiryDate`. Positive when the expiry
 * is in the future, zero on the day of expiry, negative once expired. Both ends
 * are floored to the calendar-day boundary (UTC) so partial days do not skew
 * the count.
 */
export function daysUntilExpiry(expiryDate: Date, now: Date): number {
    const expiryDay = Math.floor(expiryDate.getTime() / MS_PER_DAY)
    const nowDay = Math.floor(now.getTime() / MS_PER_DAY)
    return expiryDay - nowDay
}

/**
 * Document-expiry alert predicate.
 *
 * Returns `true` **if and only if** the number of days until expiry is within
 * the inclusive range `[0, windowDays]` — i.e. the document is due to expire
 * within the alert window and has not already expired. `windowDays` must be in
 * `[1, 365]`; an out-of-range window throws so callers validate configuration
 * before relying on the result.
 *
 * @param expiryDate The document's expiry date.
 * @param now        The reference "current" time.
 * @param windowDays Alert window in days (default {@link DEFAULT_EXPIRY_WINDOW_DAYS}).
 * @returns Whether an expiry alert should be shown.
 *
 * Requirements: 8.7.
 */
export function isWithinExpiryWindow(
    expiryDate: Date,
    now: Date,
    windowDays: number = DEFAULT_EXPIRY_WINDOW_DAYS
): boolean {
    if (
        typeof windowDays !== 'number' ||
        !Number.isInteger(windowDays) ||
        windowDays < MIN_EXPIRY_WINDOW_DAYS ||
        windowDays > MAX_EXPIRY_WINDOW_DAYS
    ) {
        throw new Error(
            `expiry alert window must be an integer in [${MIN_EXPIRY_WINDOW_DAYS}, ${MAX_EXPIRY_WINDOW_DAYS}], received: ${String(windowDays)}`
        )
    }
    const remaining = daysUntilExpiry(expiryDate, now)
    return remaining >= 0 && remaining <= windowDays
}
