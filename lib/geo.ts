/**
 * Geo, OTP, and visit-analytics pure helpers for Site Visit 2.0 (Module 9).
 *
 * Every function in this module is PURE: it performs no DB/IO, does not read
 * the global clock, and does not call `Math.random()` implicitly. Any source
 * of randomness or "now" is passed in as a parameter so the helpers stay
 * deterministic and property-testable.
 *
 * Requirements:
 *   - 12.3 — OTP check-in verification (accept iff entered === generated).
 *   - 12.4 — Geo distance + 500m geofence threshold.
 *   - 12.6 — Visit analytics aggregation (count, avg rating, avg duration).
 */

/** Mean Earth radius in meters (WGS-84 spherical approximation). */
export const EARTH_RADIUS_M = 6_371_000

/** Default geofence radius in meters (Req 12.4). */
export const DEFAULT_GEOFENCE_RADIUS_M = 500

/** Default OTP length in digits. */
export const DEFAULT_OTP_LENGTH = 6

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/**
 * Great-circle (haversine) distance in meters between two latitude/longitude
 * coordinates. The result is always non-negative and is `0` for identical
 * points.
 *
 * Requirements: 12.4.
 *
 * @throws if any coordinate is not a finite number.
 */
export function haversineMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    for (const value of [lat1, lng1, lat2, lng2]) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(
                `haversineMeters expects finite coordinates, received: ${String(value)}`
            )
        }
    }

    const dLat = toRadians(lat2 - lat1)
    const dLng = toRadians(lng2 - lng1)
    const lat1Rad = toRadians(lat1)
    const lat2Rad = toRadians(lat2)

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2
    // Clamp to [0, 1] to guard against tiny floating-point overshoot before asin.
    const c = 2 * Math.asin(Math.min(1, Math.sqrt(a)))

    return EARTH_RADIUS_M * c
}

/**
 * Whether an agent is within the geofence of a project.
 *
 * The check-in is accepted if and only if the haversine distance between the
 * agent and the project is **less than or equal to** `radiusM`; equivalently,
 * it is rejected if and only if the distance exceeds `radiusM` (design
 * Property 46).
 *
 * Requirements: 12.4.
 */
export function withinGeofence(
    agentLat: number,
    agentLng: number,
    projLat: number,
    projLng: number,
    radiusM: number = DEFAULT_GEOFENCE_RADIUS_M
): boolean {
    if (typeof radiusM !== 'number' || !Number.isFinite(radiusM)) {
        throw new Error(
            `withinGeofence expects a finite radius, received: ${String(radiusM)}`
        )
    }
    return haversineMeters(agentLat, agentLng, projLat, projLng) <= radiusM
}

/**
 * Generate a numeric OTP string of the given length.
 *
 * Randomness is injected via `random`, a function returning a value in the
 * half-open interval `[0, 1)` (matching `Math.random`'s contract). Each digit
 * is derived independently, and leading zeros are preserved so the result is
 * always exactly `length` characters long.
 *
 * Keeping randomness injectable (rather than calling `Math.random` directly)
 * makes generation deterministic and property-testable.
 *
 * Requirements: 12.2, 12.3.
 *
 * @param random A function returning a number in `[0, 1)`.
 * @param length Number of digits in the OTP (default 6). Must be a positive integer.
 * @returns A numeric string of exactly `length` digits.
 * @throws if `length` is not a positive integer.
 */
export function generateOtp(
    random: () => number,
    length: number = DEFAULT_OTP_LENGTH
): string {
    if (!Number.isInteger(length) || length <= 0) {
        throw new Error(
            `generateOtp expects a positive integer length, received: ${String(length)}`
        )
    }

    let otp = ''
    for (let i = 0; i < length; i++) {
        const r = random()
        if (typeof r !== 'number' || !Number.isFinite(r) || r < 0 || r >= 1) {
            throw new Error(
                `generateOtp expects random() to return a value in [0, 1), received: ${String(r)}`
            )
        }
        // Map [0, 1) -> {0..9}; Math.min guards the (impossible) r === 1 edge.
        const digit = Math.min(9, Math.floor(r * 10))
        otp += String(digit)
    }
    return otp
}

/**
 * Verify a submitted OTP against the stored OTP.
 *
 * Verification succeeds if and only if the entered code is exactly equal to
 * the generated code (design Property 45). A `null`/`undefined` stored code
 * (no OTP issued) can never be verified.
 *
 * Requirements: 12.3.
 */
export function verifyOtp(
    generated: string | null | undefined,
    entered: string | null | undefined
): boolean {
    if (typeof generated !== 'string' || typeof entered !== 'string') {
        return false
    }
    return generated === entered
}

/**
 * A single completed visit used for analytics aggregation. Both fields are
 * optional: a visit contributes to the average rating only when it has a
 * `buyerRating`, and to the average duration only when it has a
 * `visitDurationMin`.
 */
export interface VisitRecord {
    /** Buyer rating (1..5), if the visit was rated. */
    buyerRating?: number | null
    /** Visit duration in minutes, if the visit was timed. */
    visitDurationMin?: number | null
}

/** Aggregated analytics over a set of completed visits. */
export interface VisitAnalytics {
    /** Total number of visits in the input set. */
    visitCount: number
    /** Average buyer rating over rated visits, or `null` when none are rated. */
    averageRating: number | null
    /** Average duration (minutes) over timed visits, or `null` when none are timed. */
    averageDuration: number | null
}

/**
 * Aggregate analytics over a set of completed visits.
 *
 * Returns the visit count, the average buyer rating across visits that carry a
 * rating, and the average visit duration across visits that carry a duration.
 * Averages are `null` when there are no qualifying visits, avoiding a
 * divide-by-zero (design Property 47).
 *
 * Requirements: 12.6.
 */
export function computeVisitAnalytics(visits: VisitRecord[]): VisitAnalytics {
    const ratings: number[] = []
    const durations: number[] = []

    for (const visit of visits) {
        if (typeof visit.buyerRating === 'number' && Number.isFinite(visit.buyerRating)) {
            ratings.push(visit.buyerRating)
        }
        if (
            typeof visit.visitDurationMin === 'number' &&
            Number.isFinite(visit.visitDurationMin)
        ) {
            durations.push(visit.visitDurationMin)
        }
    }

    const average = (values: number[]): number | null =>
        values.length === 0
            ? null
            : values.reduce((sum, v) => sum + v, 0) / values.length

    return {
        visitCount: visits.length,
        averageRating: average(ratings),
        averageDuration: average(durations),
    }
}

// ─── Live agent-presence classification (Live Field-Force Tracking) ──────────

/**
 * Presence state derived from how long ago an agent's last GPS ping arrived.
 *   - `online`  — pinged within `onlineWithinSec`.
 *   - `away`    — pinged within `awayWithinSec` (but not recently enough for online).
 *   - `offline` — no ping within `awayWithinSec` (or never pinged).
 */
export type AgentPresence = 'online' | 'away' | 'offline'

/** Default: a ping is "online" if seen within the last 60s. */
export const DEFAULT_ONLINE_WITHIN_SEC = 60

/** Default: a ping is "away" if seen within the last 5 minutes. */
export const DEFAULT_AWAY_WITHIN_SEC = 300

/**
 * Classify an agent's live presence from the age of their most recent ping.
 *
 * Pure and deterministic: both "now" and the last-seen instant are passed in
 * as epoch-millisecond numbers. A `null`/`undefined` last-seen (the agent has
 * never pinged) is always `offline`. The boundaries are inclusive: an age of
 * exactly `onlineWithinSec` is still `online`, and exactly `awayWithinSec` is
 * still `away`. Future-dated pings (negative age, e.g. minor clock skew) are
 * treated as `online`.
 *
 * @param lastSeenMs       Epoch ms of the agent's latest ping, or null/undefined.
 * @param nowMs            Epoch ms of the current instant.
 * @param onlineWithinSec  Max age (seconds) to be considered online.
 * @param awayWithinSec    Max age (seconds) to be considered away.
 * @throws if `onlineWithinSec` or `awayWithinSec` is not a finite, non-negative
 *         number, or if `onlineWithinSec > awayWithinSec`.
 */
export function classifyPresence(
    lastSeenMs: number | null | undefined,
    nowMs: number,
    onlineWithinSec: number = DEFAULT_ONLINE_WITHIN_SEC,
    awayWithinSec: number = DEFAULT_AWAY_WITHIN_SEC
): AgentPresence {
    for (const [name, value] of [
        ['onlineWithinSec', onlineWithinSec],
        ['awayWithinSec', awayWithinSec],
        ['nowMs', nowMs],
    ] as const) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`classifyPresence expects a finite ${name}, received: ${String(value)}`)
        }
    }
    if (onlineWithinSec < 0 || awayWithinSec < 0) {
        throw new Error('classifyPresence thresholds must be non-negative')
    }
    if (onlineWithinSec > awayWithinSec) {
        throw new Error('classifyPresence requires onlineWithinSec <= awayWithinSec')
    }

    if (typeof lastSeenMs !== 'number' || !Number.isFinite(lastSeenMs)) {
        return 'offline'
    }

    const ageSec = (nowMs - lastSeenMs) / 1000
    // Future-dated or just-now pings are online.
    if (ageSec <= onlineWithinSec) return 'online'
    if (ageSec <= awayWithinSec) return 'away'
    return 'offline'
}
