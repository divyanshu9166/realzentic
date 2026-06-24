/**
 * Buyer Self-Service Portal — pure auth/validation helpers (Module 15).
 *
 * Every function in this module is PURE: it performs no DB/IO and never reads
 * the global clock. The "current time" is always passed in as a `now`
 * parameter so the helpers stay deterministic and property-testable.
 *
 * Persistence, OTP delivery (WhatsApp→SMS fallback), session-token issuing and
 * the 5-attempt/15-min lockout live in `app/actions/buyer-portal.ts`.
 *
 * Requirements:
 *   - 18.2 — 6-digit OTP that expires 300 seconds (5 minutes) after generation.
 *   - 18.3 — A submitted OTP that is expired or mismatched is rejected.
 *   - 18.7 — A buyer session token expires after its 24-hour lifetime.
 *   - 18.9 — Support tickets require valid fields (subject 1–200 chars,
 *            description 1–5000 chars); missing/invalid fields are rejected.
 *   - 21.3 — A Buyer_Portal OTP expires after its configured validity window.
 */

/** Default OTP time-to-live in seconds (5 minutes, Req 18.2 / 21.3). */
export const DEFAULT_OTP_TTL_SECONDS = 300

/** Default buyer-session time-to-live in seconds (24 hours, Req 18.7). */
export const DEFAULT_SESSION_TTL_SECONDS = 86_400

/** Required number of digits in a buyer OTP (Req 18.2). */
export const OTP_LENGTH = 6

/** Inclusive bounds for a support-ticket subject (Req 18.9). */
export const SUPPORT_TICKET_SUBJECT_MIN = 1
export const SUPPORT_TICKET_SUBJECT_MAX = 200

/** Inclusive bounds for a support-ticket description (Req 18.9). */
export const SUPPORT_TICKET_DESCRIPTION_MIN = 1
export const SUPPORT_TICKET_DESCRIPTION_MAX = 5_000

/**
 * A point in time accepted by the time-based helpers: either a `Date` or an
 * epoch-milliseconds number. Keeping both forms accepted avoids forcing
 * callers to convert at every call site.
 */
export type TimeInput = Date | number

/**
 * Convert a {@link TimeInput} to epoch milliseconds.
 *
 * @throws if the value is not a finite number or a valid `Date`.
 */
function toEpochMs(value: TimeInput, label: string): number {
    if (value instanceof Date) {
        const ms = value.getTime()
        if (!Number.isFinite(ms)) {
            throw new Error(`${label} is an invalid Date`)
        }
        return ms
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    throw new Error(
        `${label} expects a Date or finite epoch-ms number, received: ${String(value)}`
    )
}

/**
 * Whether an OTP generated at `generatedAt` is expired as of `now`.
 *
 * The OTP is expired if and only if the elapsed time strictly exceeds `ttl`
 * seconds (design Property 62). Exactly at the boundary (`elapsed === ttl`) the
 * OTP is still valid; one second later it is expired. A `now` earlier than
 * `generatedAt` (clock skew) yields a negative elapsed time and is treated as
 * not expired.
 *
 * Requirements: 18.2, 18.3, 21.3.
 *
 * @param generatedAt When the OTP was generated.
 * @param now         The current time to evaluate against.
 * @param ttl         Validity window in seconds (default {@link DEFAULT_OTP_TTL_SECONDS}).
 * @throws if `ttl` is not a finite, non-negative number.
 */
export function otpExpired(
    generatedAt: TimeInput,
    now: TimeInput,
    ttl: number = DEFAULT_OTP_TTL_SECONDS
): boolean {
    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl < 0) {
        throw new Error(
            `otpExpired expects a finite, non-negative ttl, received: ${String(ttl)}`
        )
    }
    const elapsedSeconds = (toEpochMs(now, 'now') - toEpochMs(generatedAt, 'generatedAt')) / 1000
    return elapsedSeconds > ttl
}

/**
 * Whether a string is a syntactically valid buyer OTP: exactly
 * {@link OTP_LENGTH} (6) ASCII digits, no sign, decimal point, or whitespace
 * (design Property 62).
 *
 * Requirements: 18.2.
 */
export function isValidOtpFormat(otp: unknown): otp is string {
    return typeof otp === 'string' && /^[0-9]{6}$/.test(otp)
}

/**
 * Whether a submitted OTP should be accepted for login.
 *
 * Acceptance requires all of:
 *   1. the stored OTP is a valid 6-digit code,
 *   2. the submitted OTP exactly equals the stored OTP, and
 *   3. the OTP has not expired as of `now`.
 *
 * Equivalently, login is rejected if the OTP is expired or does not match the
 * generated OTP (design Property 63).
 *
 * Requirements: 18.3.
 *
 * @param storedOtp   The OTP issued to the buyer (may be null/undefined if none).
 * @param submittedOtp The OTP the buyer submitted.
 * @param generatedAt When the stored OTP was generated.
 * @param now         The current time.
 * @param ttl         OTP validity window in seconds (default {@link DEFAULT_OTP_TTL_SECONDS}).
 */
export function otpAccepted(
    storedOtp: string | null | undefined,
    submittedOtp: string | null | undefined,
    generatedAt: TimeInput,
    now: TimeInput,
    ttl: number = DEFAULT_OTP_TTL_SECONDS
): boolean {
    if (!isValidOtpFormat(storedOtp) || typeof submittedOtp !== 'string') {
        return false
    }
    if (storedOtp !== submittedOtp) {
        return false
    }
    return !otpExpired(generatedAt, now, ttl)
}

/**
 * Whether a buyer session created at `createdAt` is expired as of `now`.
 *
 * The session is expired if and only if the elapsed time strictly exceeds
 * `ttl` seconds (design Property 65). At the exact boundary the session is
 * still valid. A `now` earlier than `createdAt` is treated as not expired.
 *
 * Requirements: 18.7.
 *
 * @param createdAt When the session was created.
 * @param now       The current time to evaluate against.
 * @param ttl       Session lifetime in seconds (default {@link DEFAULT_SESSION_TTL_SECONDS}).
 * @throws if `ttl` is not a finite, non-negative number.
 */
export function sessionExpired(
    createdAt: TimeInput,
    now: TimeInput,
    ttl: number = DEFAULT_SESSION_TTL_SECONDS
): boolean {
    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl < 0) {
        throw new Error(
            `sessionExpired expects a finite, non-negative ttl, received: ${String(ttl)}`
        )
    }
    const elapsedSeconds = (toEpochMs(now, 'now') - toEpochMs(createdAt, 'createdAt')) / 1000
    return elapsedSeconds > ttl
}

/** Raw fields submitted when a buyer creates a support ticket (Req 18.9). */
export interface SupportTicketInput {
    /** The buyer's contact id (required). */
    contactId?: number | null
    /** Short summary, 1–200 characters after trimming (required). */
    subject?: string | null
    /** Full description, 1–5000 characters after trimming (required). */
    description?: string | null
    /** Optional booking the ticket relates to. */
    bookingId?: number | null
    /** Optional free-text category. */
    category?: string | null
}

/** Result of validating a {@link SupportTicketInput}. */
export interface SupportTicketValidationResult {
    /** True when every required field is present and within bounds. */
    valid: boolean
    /** Human-readable, field-keyed error messages (empty when valid). */
    errors: string[]
}

/**
 * Validate the required fields of a support-ticket creation request.
 *
 * A ticket is valid if and only if all of the following hold (design
 * Property 66):
 *   - `contactId` is a positive integer,
 *   - `subject`, after trimming, has length in [1, 200], and
 *   - `description`, after trimming, has length in [1, 5000].
 *
 * If any required field is missing or out of bounds, the ticket is invalid and
 * `errors` lists each problem, so the caller (Req 18.9) can reject creation and
 * return an error. Validation is pure and order-independent.
 *
 * Requirements: 18.9.
 */
export function validateSupportTicket(
    input: SupportTicketInput
): SupportTicketValidationResult {
    const errors: string[] = []

    if (
        typeof input.contactId !== 'number' ||
        !Number.isInteger(input.contactId) ||
        input.contactId <= 0
    ) {
        errors.push('contactId is required and must be a positive integer')
    }

    const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
    if (subject.length < SUPPORT_TICKET_SUBJECT_MIN) {
        errors.push('subject is required')
    } else if (subject.length > SUPPORT_TICKET_SUBJECT_MAX) {
        errors.push(`subject must be at most ${SUPPORT_TICKET_SUBJECT_MAX} characters`)
    }

    const description =
        typeof input.description === 'string' ? input.description.trim() : ''
    if (description.length < SUPPORT_TICKET_DESCRIPTION_MIN) {
        errors.push('description is required')
    } else if (description.length > SUPPORT_TICKET_DESCRIPTION_MAX) {
        errors.push(
            `description must be at most ${SUPPORT_TICKET_DESCRIPTION_MAX} characters`
        )
    }

    return { valid: errors.length === 0, errors }
}
