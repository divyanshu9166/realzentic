/**
 * Pure helpers for the Follow-up section.
 *
 * A follow-up is "due" relative to a reference instant based only on the
 * calendar date (local-day granularity), independent of time-of-day, so a
 * follow-up scheduled for today is "today" all day. Every function here is
 * pure and deterministic — "now" is always passed in.
 */

/** Bucket a follow-up falls into relative to "now". */
export type FollowUpDueBucket = 'overdue' | 'today' | 'upcoming'

/** Number of whole days in milliseconds. */
const DAY_MS = 86_400_000

/**
 * Floor an epoch-ms instant to the start of its UTC day (00:00:00.000 UTC).
 * Using a single, explicit timezone (UTC) keeps the calculation deterministic
 * and free of host-timezone drift in tests.
 */
export function startOfUtcDay(ms: number): number {
    return Math.floor(ms / DAY_MS) * DAY_MS
}

/**
 * Classify a follow-up by its scheduled date relative to `nowMs`:
 *   - `overdue`  — the scheduled day is strictly before today.
 *   - `today`    — the scheduled day is the same calendar day as now.
 *   - `upcoming` — the scheduled day is after today.
 *
 * @throws if either argument is not a finite number.
 */
export function classifyFollowUpDue(followUpMs: number, nowMs: number): FollowUpDueBucket {
    for (const [name, value] of [
        ['followUpMs', followUpMs],
        ['nowMs', nowMs],
    ] as const) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`classifyFollowUpDue expects a finite ${name}, received: ${String(value)}`)
        }
    }

    const followDay = startOfUtcDay(followUpMs)
    const today = startOfUtcDay(nowMs)

    if (followDay < today) return 'overdue'
    if (followDay > today) return 'upcoming'
    return 'today'
}

/**
 * Whole days from `nowMs` to `followUpMs`, counted at day granularity.
 * Negative when the follow-up is in the past (overdue), 0 when today, positive
 * when upcoming. Useful for "in 3 days" / "5 days overdue" labels.
 */
export function daysUntilFollowUp(followUpMs: number, nowMs: number): number {
    for (const [name, value] of [
        ['followUpMs', followUpMs],
        ['nowMs', nowMs],
    ] as const) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`daysUntilFollowUp expects a finite ${name}, received: ${String(value)}`)
        }
    }
    return Math.round((startOfUtcDay(followUpMs) - startOfUtcDay(nowMs)) / DAY_MS)
}
