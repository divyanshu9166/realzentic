/**
 * Property-based tests for the Demand Letter & Payment Automation pure helpers
 * in `lib/demand.ts` (Module 6).
 *
 * These implement the following numbered design properties (design.md →
 * Correctness Properties → Demand Letters):
 *
 *   - Property 36 — Demand letter generation and de-duplication (Req 9.1)
 *   - Property 37 — Overdue collections aggregation             (Req 9.6)
 *
 * Only the pure, IO-free decision/aggregation logic is exercised here:
 * `shouldGenerateDemand` decides whether a letter is generated for a milestone
 * (the server action persists the letter when it returns true), and
 * `aggregateOverdueCollections` rolls overdue milestones into the dashboard
 * widget figures. All tests run with the project default of 100 iterations via
 * `fcAssert`.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { milestoneStatus, type MilestoneLike } from '@/lib/deals'
import {
    aggregateOverdueCollections,
    shouldGenerateDemand,
    type DemandLetterLike,
} from '@/lib/demand'
import { MONEY_MAX, roundMoney } from '@/lib/money'
import { fcAssert } from '@/test/generators'

// ---------------------------------------------------------------------------
// Local arbitraries
// ---------------------------------------------------------------------------

/** The configured lead windows the platform supports (Req 9.1). */
const windowDaysArb: fc.Arbitrary<number> = fc.constantFrom(7, 15, 30)

/** A monetary amount strictly greater than zero (so a milestone can be unpaid). */
const positiveMoneyArb: fc.Arbitrary<number> = fc
    .double({ min: 0.01, max: MONEY_MAX, noNaN: true, noDefaultInfinity: true })
    .map((n) => roundMoney(n))
    .filter((n) => n > 0)

/** A reference "now" instant spanning a realistic operating window. */
const nowArb: fc.Arbitrary<Date> = fc.date({
    min: new Date('2010-01-01T00:00:00.000Z'),
    max: new Date('2040-12-31T23:59:59.000Z'),
})

/** Return a new Date `days` calendar days after `date` (mirrors the helper). */
function addDays(date: Date, days: number): Date {
    const result = new Date(date.getTime())
    result.setDate(result.getDate() + Math.trunc(days))
    return result
}

/**
 * An unpaid milestone: `paidAmount` is strictly less than `amount`.
 * The due date is supplied separately by each scenario.
 */
function unpaidMilestoneArb(dueDate: Date): fc.Arbitrary<MilestoneLike> {
    return positiveMoneyArb.chain((amount) =>
        fc
            .double({ min: 0, max: 0.999, noNaN: true, noDefaultInfinity: true })
            .map((paidFraction) => {
                // Keep paid strictly below amount so the milestone stays unpaid.
                const paid = Math.min(roundMoney(amount * paidFraction), roundMoney(amount - 0.01))
                return { amount, paidAmount: Math.max(0, paid), dueDate } as MilestoneLike
            }),
    )
}

// ---------------------------------------------------------------------------
// Property 36 — Demand letter generation and de-duplication (Req 9.1)
// ---------------------------------------------------------------------------

describe('shouldGenerateDemand (Property 36)', () => {
    // Feature: real-estate-crm, Property 36: Demand letter generation and de-duplication
    it('generates iff the milestone is unpaid, due within the window, and no prior letter exists for that window', () => {
        // An unpaid milestone whose due date is chosen to fall *inside* the
        // window [now, now + windowDays]: a letter is generated only when no
        // prior letter exists for the same window.
        const inWindowArb = windowDaysArb.chain((windowDays) =>
            nowArb.chain((now) =>
                // offset in days within [0, windowDays] keeps the due date inside.
                fc.integer({ min: 0, max: windowDays }).chain((offsetDays) => {
                    const due = addDays(now, offsetDays)
                    return unpaidMilestoneArb(due).chain((milestone) =>
                        // Existing letters: either none, or some that may or may
                        // not match the current window.
                        fc
                            .array(
                                fc.record<DemandLetterLike>({
                                    windowDays: fc.constantFrom(7, 15, 30),
                                }),
                                { maxLength: 5 },
                            )
                            .map((existingLetters) => ({
                                milestone,
                                now,
                                windowDays,
                                existingLetters,
                            })),
                    )
                }),
            ),
        )

        fcAssert(
            fc.property(inWindowArb, ({ milestone, now, windowDays, existingLetters }) => {
                const result = shouldGenerateDemand(milestone, now, windowDays, existingLetters)

                const alreadyForWindow = existingLetters.some(
                    (l) => Math.trunc(Number(l.windowDays)) === windowDays,
                )
                // Unpaid + in-window: generate iff no prior letter for this window.
                expect(result).toBe(!alreadyForWindow)
            }),
        )
    })

    // Feature: real-estate-crm, Property 36: Demand letter generation and de-duplication
    it('never generates for a fully-paid milestone, regardless of window or due date', () => {
        const paidScenarioArb = windowDaysArb.chain((windowDays) =>
            nowArb.chain((now) =>
                fc.integer({ min: 0, max: windowDays }).chain((offsetDays) =>
                    positiveMoneyArb.map((amount) => ({
                        milestone: {
                            amount,
                            // Fully paid (>= amount) ⇒ ineligible.
                            paidAmount: amount,
                            dueDate: addDays(now, offsetDays),
                        } as MilestoneLike,
                        now,
                        windowDays,
                    })),
                ),
            ),
        )

        fcAssert(
            fc.property(paidScenarioArb, ({ milestone, now, windowDays }) => {
                expect(shouldGenerateDemand(milestone, now, windowDays, [])).toBe(false)
            }),
        )
    })

    // Feature: real-estate-crm, Property 36: Demand letter generation and de-duplication
    it('never generates when the due date falls outside the window [now, now + windowDays]', () => {
        // Build due dates strictly before `now` or strictly after `now + window`.
        const outOfWindowArb = windowDaysArb.chain((windowDays) =>
            nowArb.chain((now) =>
                fc
                    .oneof(
                        // Strictly before now.
                        fc.integer({ min: 1, max: 3650 }).map((d) => addDays(now, -d)),
                        // Strictly after now + windowDays.
                        fc.integer({ min: 1, max: 3650 }).map((d) => addDays(now, windowDays + d)),
                    )
                    .chain((due) =>
                        unpaidMilestoneArb(due).map((milestone) => ({
                            milestone,
                            now,
                            windowDays,
                        })),
                    ),
            ),
        )

        fcAssert(
            fc.property(outOfWindowArb, ({ milestone, now, windowDays }) => {
                const due = new Date(milestone.dueDate).getTime()
                const start = now.getTime()
                const end = addDays(now, windowDays).getTime()
                fc.pre(due < start || due > end)
                expect(shouldGenerateDemand(milestone, now, windowDays, [])).toBe(false)
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 37 — Overdue collections aggregation (Req 9.6)
// ---------------------------------------------------------------------------

describe('aggregateOverdueCollections (Property 37)', () => {
    /** A milestone carrying an explicit persisted status. */
    const statusMilestoneArb: fc.Arbitrary<MilestoneLike> = positiveMoneyArb.chain((amount) =>
        fc
            .double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
            .chain((paidFraction) =>
                fc
                    .constantFrom<MilestoneLike['status']>(
                        'Upcoming',
                        'Due',
                        'Overdue',
                        'Paid',
                        'Partially_Paid',
                    )
                    .map((status) => {
                        const paid = Math.min(roundMoney(amount * paidFraction), amount)
                        return {
                            amount,
                            paidAmount: paid,
                            dueDate: new Date('2030-01-01T00:00:00.000Z'),
                            status,
                        } as MilestoneLike
                    }),
            ),
    )

    // Feature: real-estate-crm, Property 37: Overdue collections aggregation
    it('counts only Overdue milestones (by persisted status) and sums their unpaid amounts', () => {
        fcAssert(
            fc.property(fc.array(statusMilestoneArb, { maxLength: 50 }), (milestones) => {
                const result = aggregateOverdueCollections(milestones)

                // Independent reference aggregation over the persisted status.
                let expectedCount = 0
                let expectedSum = 0
                for (const m of milestones) {
                    if (m.status !== 'Overdue') continue
                    const amount = roundMoney(Number(m.amount) || 0)
                    const paid = roundMoney(Number(m.paidAmount) || 0)
                    const unpaid = roundMoney(Math.max(0, amount - paid))
                    expectedCount += 1
                    expectedSum = roundMoney(expectedSum + unpaid)
                }

                expect(result.count).toBe(expectedCount)
                expect(result.sumUnpaid).toBe(expectedSum)
                // Count is bounded by the input size; sum is non-negative.
                expect(result.count).toBeLessThanOrEqual(milestones.length)
                expect(result.sumUnpaid).toBeGreaterThanOrEqual(0)
            }),
        )
    })

    // Feature: real-estate-crm, Property 37: Overdue collections aggregation
    it('derives Overdue status from `now` when provided, consistent with milestoneStatus', () => {
        // Milestones with explicit due dates; `now` decides Overdue via the
        // shared derivation. amount/paid vary so paid milestones are excluded.
        const dueDateArb = fc.date({
            min: new Date('2010-01-01T00:00:00.000Z'),
            max: new Date('2040-12-31T23:59:59.000Z'),
        })
        const derivedMilestoneArb: fc.Arbitrary<MilestoneLike> = positiveMoneyArb.chain((amount) =>
            fc
                .double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
                .chain((paidFraction) =>
                    dueDateArb.map((dueDate) => {
                        const paid = Math.min(roundMoney(amount * paidFraction), amount)
                        return { amount, paidAmount: paid, dueDate } as MilestoneLike
                    }),
                ),
        )

        fcAssert(
            fc.property(
                fc.array(derivedMilestoneArb, { maxLength: 50 }),
                nowArb,
                (milestones, now) => {
                    const result = aggregateOverdueCollections(milestones, now)

                    let expectedCount = 0
                    let expectedSum = 0
                    for (const m of milestones) {
                        if (milestoneStatus(m, now) !== 'Overdue') continue
                        const amount = roundMoney(Number(m.amount) || 0)
                        const paid = roundMoney(Number(m.paidAmount) || 0)
                        const unpaid = roundMoney(Math.max(0, amount - paid))
                        expectedCount += 1
                        expectedSum = roundMoney(expectedSum + unpaid)
                    }

                    expect(result.count).toBe(expectedCount)
                    expect(result.sumUnpaid).toBe(expectedSum)
                },
            ),
        )
    })
})
