/**
 * Property-based tests for the Deal Pipeline & Booking Engine pure helpers in
 * `lib/deals.ts` (Module 3).
 *
 * These implement the following numbered design properties (design.md →
 * Correctness Properties → Deal Pipeline & Booking):
 *
 *   - Property 17 — Valid stage move logs an activity        (Req 4.3)
 *   - Property 18 — Invalid stage move is rejected           (Req 4.4)
 *   - Property 19 — Lost stage requires a lost reason        (Req 4.9)
 *   - Property 20 — Deal analytics aggregation               (Req 4.8)
 *   - Property 23 — Milestone status reflects payment/due    (Req 5.8, 9.7)
 *   - Property 24 — Invalid milestone payments are rejected  (Req 9.8)
 *
 * Only the pure, IO-free decision logic is exercised here: `validateStageMove`
 * decides whether a move is permitted (the server action logs the DealActivity
 * when it returns ok), `aggregateDealAnalytics` groups deals by stage, and the
 * milestone helpers derive status / apply payments. All tests run with the
 * project default of 100 iterations via `fcAssert`.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
    aggregateDealAnalytics,
    applyMilestonePayment,
    milestoneStatus,
    validateStageMove,
    type DealLike,
    type MilestoneLike,
    type StageLike,
} from '@/lib/deals'
import { MONEY_MAX, roundMoney } from '@/lib/money'
import { fcAssert, moneyArb } from '@/test/generators'

// ---------------------------------------------------------------------------
// Local arbitraries
// ---------------------------------------------------------------------------

/** A stage id (positive, mirrors a persisted DealStage id). */
const stageIdArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 12 })

/** A non-empty, non-whitespace lost reason. */
const lostReasonArb: fc.Arbitrary<string> = fc
    .string({ minLength: 1, maxLength: 40 })
    .filter((s) => s.trim().length > 0)

/** A deal with a 2-decimal monetary value, optionally carrying a lost reason. */
const dealArb: fc.Arbitrary<DealLike> = fc.record({
    stageId: stageIdArb,
    value: moneyArb,
    lostReason: fc.option(lostReasonArb, { nil: null }),
})

/** A monetary amount strictly greater than zero (so a milestone has an outstanding balance). */
const positiveMoneyArb: fc.Arbitrary<number> = fc
    .double({ min: 0.01, max: MONEY_MAX, noNaN: true, noDefaultInfinity: true })
    .map((n) => roundMoney(n))
    .filter((n) => n > 0)

/** Dates spanning a realistic booking window. */
const dateArb: fc.Arbitrary<Date> = fc.date({
    min: new Date('2000-01-01T00:00:00.000Z'),
    max: new Date('2050-12-31T23:59:59.000Z'),
    noInvalidDate: true,
})

/**
 * A milestone together with a payment that is valid for it
 * (`0 < payment <= outstanding`).
 */
const milestoneWithValidPaymentArb: fc.Arbitrary<{
    milestone: MilestoneLike
    payment: number
}> = positiveMoneyArb.chain((amount) =>
    fc
        .double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
        .chain((paidFraction) => {
            const paid = roundMoney(amount * paidFraction)
            const outstanding = roundMoney(amount - Math.min(paid, amount))
            return fc
                .record({
                    payFraction: fc.double({
                        min: 0,
                        max: 1,
                        noNaN: true,
                        noDefaultInfinity: true,
                    }),
                    dueDate: dateArb,
                })
                .map(({ payFraction, dueDate }) => {
                    const cappedPaid = Math.min(paid, amount)
                    // Choose a payment in (0, outstanding]; force the open lower
                    // bound by snapping a zero draw up to the full outstanding.
                    let payment = roundMoney(outstanding * payFraction)
                    if (payment <= 0) payment = outstanding
                    return {
                        milestone: {
                            amount,
                            paidAmount: cappedPaid,
                            dueDate,
                        } as MilestoneLike,
                        payment,
                    }
                })
        }),
)

// ---------------------------------------------------------------------------
// Property 17 — Valid stage move logs an activity (Req 4.3)
// ---------------------------------------------------------------------------

describe('validateStageMove — valid moves (Property 17)', () => {
    // Feature: real-estate-crm, Property 17: Valid stage move logs an activity
    it('permits any move to an existing stage that is not lost (so the caller logs an activity)', () => {
        const nonLostStageArb: fc.Arbitrary<StageLike> = fc.record({
            id: stageIdArb,
            isLost: fc.constant(false),
        })

        fcAssert(
            fc.property(dealArb, nonLostStageArb, (deal, targetStage) => {
                const result = validateStageMove(deal, targetStage)
                expect(result.ok).toBe(true)
                expect(result.error).toBeUndefined()
            }),
        )
    })

    // Feature: real-estate-crm, Property 17: Valid stage move logs an activity
    it('permits a move to a lost stage when a lost reason is supplied', () => {
        const lostStageArb: fc.Arbitrary<StageLike> = fc.record({
            id: stageIdArb,
            isLost: fc.constant(true),
        })

        fcAssert(
            fc.property(dealArb, lostStageArb, lostReasonArb, (deal, targetStage, reason) => {
                const result = validateStageMove(deal, targetStage, reason)
                expect(result.ok).toBe(true)
                expect(result.error).toBeUndefined()
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 18 — Invalid stage move is rejected (Req 4.4)
// ---------------------------------------------------------------------------

describe('validateStageMove — missing target (Property 18)', () => {
    // Feature: real-estate-crm, Property 18: Invalid stage move is rejected
    it('rejects a move to a non-existent stage, retains the deal stage, and returns an error', () => {
        const missingStageArb = fc.constantFrom<null | undefined>(null, undefined)

        fcAssert(
            fc.property(dealArb, missingStageArb, (deal, targetStage) => {
                const originalStageId = deal.stageId
                const result = validateStageMove(deal, targetStage)

                expect(result.ok).toBe(false)
                expect(result.error).toBeTruthy()
                // The helper never mutates the deal: its current stage is retained.
                expect(deal.stageId).toBe(originalStageId)
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 19 — Lost stage requires a lost reason (Req 4.9)
// ---------------------------------------------------------------------------

describe('validateStageMove — lost stage (Property 19)', () => {
    // Feature: real-estate-crm, Property 19: Lost stage requires a lost reason
    it('rejects a move to a lost stage when no lost reason is provided and retains the deal stage', () => {
        // Blank / whitespace-only reasons count as "no reason provided".
        const blankReasonArb = fc.constantFrom<string | null | undefined>(
            undefined,
            null,
            '',
            '   ',
            '\t',
        )
        // Deal carries no usable lost reason of its own.
        const dealWithoutReasonArb: fc.Arbitrary<DealLike> = fc.record({
            stageId: stageIdArb,
            value: moneyArb,
            lostReason: blankReasonArb,
        })
        const lostStageArb: fc.Arbitrary<StageLike> = fc.record({
            id: stageIdArb,
            isLost: fc.constant(true),
        })

        fcAssert(
            fc.property(
                dealWithoutReasonArb,
                lostStageArb,
                blankReasonArb,
                (deal, targetStage, reason) => {
                    const originalStageId = deal.stageId
                    const result = validateStageMove(deal, targetStage, reason)

                    expect(result.ok).toBe(false)
                    expect(result.error).toBeTruthy()
                    expect(deal.stageId).toBe(originalStageId)
                },
            ),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 20 — Deal analytics aggregation (Req 4.8)
// ---------------------------------------------------------------------------

describe('aggregateDealAnalytics (Property 20)', () => {
    // Feature: real-estate-crm, Property 20: Deal analytics aggregation
    it('returns per-stage counts and value sums matching an independent grouping', () => {
        fcAssert(
            fc.property(fc.array(dealArb, { maxLength: 50 }), (deals) => {
                const rows = aggregateDealAnalytics(deals)

                // Independent reference aggregation.
                const expected = new Map<number, { count: number; total: number }>()
                for (const deal of deals) {
                    const entry = expected.get(deal.stageId) ?? { count: 0, total: 0 }
                    entry.count += 1
                    entry.total = roundMoney(entry.total + (Number(deal.value) || 0))
                    expected.set(deal.stageId, entry)
                }

                // One row per distinct stage, sorted ascending by stageId.
                expect(rows).toHaveLength(expected.size)
                const ids = rows.map((r) => r.stageId)
                expect([...ids]).toEqual([...ids].sort((a, b) => a - b))

                // Total count is preserved.
                expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(deals.length)

                // Each row matches the reference count and value sum.
                for (const row of rows) {
                    const ref = expected.get(row.stageId)
                    expect(ref).toBeDefined()
                    expect(row.count).toBe(ref!.count)
                    expect(row.totalValue).toBe(ref!.total)
                }
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 23 — Milestone status reflects payment and due date (Req 5.8, 9.7)
// ---------------------------------------------------------------------------

describe('milestone status & payment application (Property 23)', () => {
    // Feature: real-estate-crm, Property 23: Milestone status reflects payment and due date
    it('applies a valid payment (0 < p <= outstanding) and derives Paid/Partially_Paid and Overdue correctly', () => {
        // Part A: applying a valid payment increases paid amount by p and sets
        // status to Paid (when fully paid) or Partially_Paid (otherwise).
        fcAssert(
            fc.property(milestoneWithValidPaymentArb, ({ milestone, payment }) => {
                const total = roundMoney(Number(milestone.amount) || 0)
                const before = roundMoney(Number(milestone.paidAmount) || 0)
                const outstanding = roundMoney(total - before)
                fc.pre(payment > 0 && payment <= outstanding)

                const result = applyMilestonePayment(milestone, payment)
                expect(result.ok).toBe(true)
                expect(result.milestone).toBeDefined()

                const newPaid = roundMoney(before + payment)
                expect(result.milestone!.paidAmount).toBe(newPaid)
                expect(result.milestone!.status).toBe(
                    newPaid >= total ? 'Paid' : 'Partially_Paid',
                )
                // Original milestone is left untouched (pure update).
                expect(milestone.paidAmount).toBe(before)
            }),
        )

        // Part B: any unpaid milestone whose due date has passed is Overdue.
        const overdueArb = positiveMoneyArb.chain((amount) =>
            fc
                .double({ min: 0, max: 0.99, noNaN: true, noDefaultInfinity: true })
                .chain((paidFraction) =>
                    fc
                        .record({ due: dateArb, gapMs: fc.integer({ min: 1, max: 5_000_000_000 }) })
                        .map(({ due, gapMs }) => {
                            const paid = roundMoney(amount * paidFraction)
                            return {
                                milestone: {
                                    amount,
                                    paidAmount: Math.min(paid, roundMoney(amount - 0.01)),
                                    dueDate: due,
                                } as MilestoneLike,
                                now: new Date(due.getTime() + gapMs),
                            }
                        }),
                ),
        )

        fcAssert(
            fc.property(overdueArb, ({ milestone, now }) => {
                const total = roundMoney(Number(milestone.amount) || 0)
                const paid = roundMoney(Number(milestone.paidAmount) || 0)
                fc.pre(paid < total) // unpaid
                expect(milestoneStatus(milestone, now)).toBe('Overdue')
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 24 — Invalid milestone payments are rejected (Req 9.8)
// ---------------------------------------------------------------------------

describe('applyMilestonePayment — invalid payments (Property 24)', () => {
    // Feature: real-estate-crm, Property 24: Invalid milestone payments are rejected
    it('rejects zero, negative, or over-outstanding payments and leaves the milestone unchanged', () => {
        const scenarioArb = positiveMoneyArb.chain((amount) =>
            fc
                .double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
                .chain((paidFraction) => {
                    const paid = Math.min(roundMoney(amount * paidFraction), amount)
                    const outstanding = roundMoney(amount - paid)
                    // Invalid payment kinds: zero, negative, or strictly over outstanding.
                    const invalidPaymentArb = fc.oneof(
                        fc.constant(0),
                        fc
                            .double({ min: 0.01, max: MONEY_MAX, noNaN: true, noDefaultInfinity: true })
                            .map((n) => -roundMoney(n))
                            .filter((n) => n < 0),
                        fc
                            .double({ min: 0.01, max: MONEY_MAX, noNaN: true, noDefaultInfinity: true })
                            .map((n) => roundMoney(outstanding + Math.max(n, 0.01)))
                            .filter((n) => n > outstanding),
                    )
                    return fc.record({
                        milestone: fc
                            .record({ due: dateArb })
                            .map(({ due }) => ({ amount, paidAmount: paid, dueDate: due } as MilestoneLike)),
                        payment: invalidPaymentArb,
                        outstanding: fc.constant(outstanding),
                    })
                }),
        )

        fcAssert(
            fc.property(scenarioArb, ({ milestone, payment, outstanding }) => {
                fc.pre(payment <= 0 || payment > outstanding)
                const beforePaid = milestone.paidAmount
                const beforeAmount = milestone.amount

                const result = applyMilestonePayment(milestone, payment)
                expect(result.ok).toBe(false)
                expect(result.error).toBeTruthy()
                expect(result.milestone).toBeUndefined()
                // Milestone is left unchanged.
                expect(milestone.paidAmount).toBe(beforePaid)
                expect(milestone.amount).toBe(beforeAmount)
            }),
        )
    })
})
