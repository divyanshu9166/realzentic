/**
 * Pure, IO-free helpers for Demand Letter & Payment Automation (Module 6).
 *
 * Every function here is deterministic and side-effect free: no database
 * access, no clock reads (callers pass `now`), and no network. This keeps the
 * core collections rules trivially unit- and property-testable. Server actions
 * in `app/actions/deals.ts` compose these helpers with Prisma and transports.
 *
 * Monetary aggregation is delegated to `lib/money.ts` so overdue sums share
 * the platform's round-half-up, 2-decimal semantics. Milestone status is
 * derived with the shared `milestoneStatus` helper from `lib/deals.ts` so the
 * "Overdue" definition stays consistent across the booking and collections
 * services.
 *
 * Requirements: 9.1 (demand-letter generation with de-duplication),
 * 9.6 (overdue-collections aggregation).
 */

import { milestoneStatus, type MilestoneLike, type MilestoneStatusValue } from './deals'
import { roundMoney } from './money'

/**
 * Minimal shape of an existing demand letter needed for de-duplication.
 * Mirrors the relevant fields of the Prisma `DemandLetter` model.
 */
export interface DemandLetterLike {
    /** The lead window (in days) the letter was generated for. */
    windowDays: number
}

/** Result of the overdue-collections aggregation. */
export interface OverdueCollections {
    /** Number of milestones whose status is `Overdue`. */
    count: number
    /** Sum of the unpaid amounts (`amount − paidAmount`) of those milestones. */
    sumUnpaid: number
}

/** Return a new Date that is `days` calendar days after `date`. */
function addDays(date: Date, days: number): Date {
    const result = new Date(date.getTime())
    result.setDate(result.getDate() + (Number.isFinite(days) ? Math.trunc(days) : 0))
    return result
}

/** Coerce a milestone's due date (Date | string) into a Date. */
function toDueDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value)
}

/**
 * Decide whether a demand letter should be generated for a milestone.
 *
 * Returns `true` if and only if (Req 9.1):
 * 1. The milestone is unpaid — its paid amount is strictly less than its
 *    amount (equivalently, its derived status is not `Paid`).
 * 2. Its due date falls within the configured lead window — between `now`
 *    (inclusive) and `now + windowDays` (inclusive).
 * 3. No demand letter already exists for that milestone within the same
 *    window — de-duplication is keyed on `windowDays`, so a prior letter with
 *    the same `windowDays` suppresses a duplicate.
 *
 * The function is purely decisional; the caller persists the letter on `true`.
 *
 * @param milestone The milestone under consideration.
 * @param now The reference instant used to evaluate the lead window.
 * @param windowDays The configured lead window (e.g. 7, 15, or 30 days).
 * @param existingLetters Demand letters already recorded for this milestone.
 *
 * Requirements: 9.1
 */
export function shouldGenerateDemand(
    milestone: MilestoneLike,
    now: Date,
    windowDays: number,
    existingLetters: DemandLetterLike[] = [],
): boolean {
    // (1) Unpaid: any milestone that is not fully paid is eligible.
    const amount = roundMoney(Number(milestone.amount) || 0)
    const paid = roundMoney(Number(milestone.paidAmount) || 0)
    if (paid >= amount) return false

    // A non-positive window can never contain a future due date meaningfully.
    const window = Number.isFinite(windowDays) ? Math.trunc(windowDays) : 0
    if (window <= 0) return false

    // (2) Due date within the lead window [now, now + windowDays].
    const due = toDueDate(milestone.dueDate).getTime()
    if (Number.isNaN(due)) return false
    const start = now.getTime()
    const end = addDays(now, window).getTime()
    if (due < start || due > end) return false

    // (3) De-duplicate on the same window: a prior letter for this window
    // suppresses a duplicate.
    const alreadyGenerated = existingLetters.some(
        (letter) => Math.trunc(Number(letter?.windowDays)) === window,
    )
    if (alreadyGenerated) return false

    return true
}

/**
 * Aggregate a set of milestones into the Overdue Collections widget figures:
 * the count of overdue milestones and the sum of their unpaid amounts (Req 9.6).
 *
 * A milestone is counted when its status is `Overdue`. When `now` is provided,
 * status is derived from payment and due date via {@link milestoneStatus} so
 * the aggregation stays consistent with the booking engine; otherwise the
 * milestone's persisted `status` field is used. The unpaid amount for each
 * counted milestone is `amount − paidAmount`, clamped at zero and rounded to
 * two decimals, and the sum itself is kept at 2-decimal precision.
 *
 * @param milestones The milestones to aggregate.
 * @param now Optional reference instant; when given, status is derived.
 *
 * Requirements: 9.6
 */
export function aggregateOverdueCollections(
    milestones: MilestoneLike[],
    now?: Date,
): OverdueCollections {
    let count = 0
    let sumUnpaid = 0

    for (const milestone of milestones) {
        const status: MilestoneStatusValue | undefined =
            now != null ? milestoneStatus(milestone, now) : milestone.status

        if (status !== 'Overdue') continue

        const amount = roundMoney(Number(milestone.amount) || 0)
        const paid = roundMoney(Number(milestone.paidAmount) || 0)
        const unpaid = roundMoney(Math.max(0, amount - paid))

        count += 1
        sumUnpaid = roundMoney(sumUnpaid + unpaid)
    }

    return { count, sumUnpaid }
}
