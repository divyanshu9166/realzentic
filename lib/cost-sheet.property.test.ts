/**
 * Property-based tests for the Cost Sheet pure helpers (`lib/cost-sheet.ts`).
 *
 * Implements design correctness properties 12–16 (Cost Sheet & Payment Plans)
 * using `fast-check` on the Vitest runner. Each property runs the project
 * default of 100 iterations via {@link fcAssert} and carries the required
 * property-tag comment:
 *
 *   // Feature: real-estate-crm, Property N: <text>
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11, 5.5, 10.3
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
    computeNetPayable,
    validateDiscount,
    computeStampDuty,
    stampDutyRateForState,
    gstRateForProject,
    splitMilestones,
    STAMP_DUTY_RATES,
    MAHARASHTRA_STAMP_DUTY_RATE,
    GST_RATE_UNDER_CONSTRUCTION,
    GST_RATE_READY_TO_MOVE,
    GST_RATE_DEFAULT,
    type PaymentPlanInput,
} from '@/lib/cost-sheet'
import { roundMoney, MONEY_MAX } from '@/lib/money'
import { fcAssert, moneyArb } from '@/test/generators'

// ---------------------------------------------------------------------------
// Local arbitraries
// ---------------------------------------------------------------------------

/**
 * A `total` constrained to a quarter of the money range so that, combined with
 * the constrained add-ons below, the gross amount (`total + Σ(add-ons)`) stays
 * comfortably within the inclusive money range and never overflows.
 */
const totalArb: fc.Arbitrary<number> = fc
    .double({ min: 0, max: MONEY_MAX / 4, noNaN: true, noDefaultInfinity: true })
    .map((n) => roundMoney(n))

/**
 * A list of add-on charges whose summed magnitude is bounded so that
 * `total + Σ(add-ons) <= MONEY_MAX`. Up to 8 add-ons, each up to MONEY_MAX/32,
 * yields a maximum add-on sum of MONEY_MAX/4.
 */
const addonsArb: fc.Arbitrary<number[]> = fc.array(
    fc
        .double({ min: 0, max: MONEY_MAX / 32, noNaN: true, noDefaultInfinity: true })
        .map((n) => roundMoney(n)),
    { maxLength: 8 }
)

/** A fraction in `[0, 1]`, used to derive a discount that cannot exceed gross. */
const fractionArb: fc.Arbitrary<number> = fc.double({
    min: 0,
    max: 1,
    noNaN: true,
    noDefaultInfinity: true,
})

/** The sum of a list of add-ons, rounded to money precision (mirrors the impl). */
function sumAddons(addons: number[]): number {
    return roundMoney(addons.reduce((acc, a) => acc + a, 0))
}

// ---------------------------------------------------------------------------
// Property 12: Net payable composition (Req 3.3)
// ---------------------------------------------------------------------------

describe('Property 12: Net payable composition', () => {
    // Feature: real-estate-crm, Property 12: For any total, set of add-on charges, and discount within the valid money range, net payable equals `total + Σ(add-ons) − discount`.
    it('net payable equals total + Σ(add-ons) − discount', () => {
        fcAssert(
            fc.property(totalArb, addonsArb, fractionArb, (total, addons, fraction) => {
                const gross = roundMoney(total + sumAddons(addons))
                // A discount derived from a [0,1] fraction can never exceed gross.
                const discount = roundMoney(gross * fraction)
                const expected = roundMoney(gross - discount)

                expect(computeNetPayable(total, addons, discount)).toBe(expected)
            })
        )
    })
})

// ---------------------------------------------------------------------------
// Property 13: Discount never makes net payable negative (Req 3.4)
// ---------------------------------------------------------------------------

describe('Property 13: Discount never makes net payable negative', () => {
    // Feature: real-estate-crm, Property 13: For any gross amount (total plus add-ons) and discount, if discount exceeds gross the cost sheet is rejected; otherwise the resulting net payable is greater than or equal to 0.
    it('rejects discounts exceeding gross, otherwise net payable >= 0', () => {
        fcAssert(
            fc.property(totalArb, addonsArb, moneyArb, (total, addons, discount) => {
                const gross = roundMoney(total + sumAddons(addons))

                if (!validateDiscount(gross, discount)) {
                    // Discount exceeds gross (or is otherwise invalid): rejected.
                    expect(() => computeNetPayable(total, addons, discount)).toThrow()
                } else {
                    const net = computeNetPayable(total, addons, discount)
                    expect(net).toBeGreaterThanOrEqual(0)
                }
            })
        )
    })
})

// ---------------------------------------------------------------------------
// Property 14: Stamp duty uses state rate with Maharashtra default (Req 3.5, 10.3)
// ---------------------------------------------------------------------------

const knownStateKeys = Object.keys(STAMP_DUTY_RATES)

/**
 * State names exercising configured keys (with casing/whitespace variants to
 * confirm case-insensitive matching) and arbitrary strings (fallback path).
 */
const stateArb: fc.Arbitrary<string> = fc.oneof(
    fc.constantFrom(...knownStateKeys),
    fc.constantFrom(...knownStateKeys).map((s) => s.toUpperCase()),
    fc.constantFrom(...knownStateKeys).map((s) => `  ${s}  `),
    fc.string()
)

describe('Property 14: Stamp duty uses state rate with Maharashtra default', () => {
    // Feature: real-estate-crm, Property 14: For any project state and base amount, computed stamp duty equals `base × rate`, where `rate` is the configured rate for that state when present and the Maharashtra default rate otherwise.
    it('stamp duty equals base × (configured-or-Maharashtra-default) rate', () => {
        fcAssert(
            fc.property(stateArb, moneyArb, (state, base) => {
                // Independently resolve the expected rate from the seed table.
                const key = state.trim().toLowerCase()
                const expectedRate = Object.prototype.hasOwnProperty.call(STAMP_DUTY_RATES, key)
                    ? STAMP_DUTY_RATES[key]
                    : MAHARASHTRA_STAMP_DUTY_RATE
                const expected = roundMoney(base * expectedRate)

                expect(computeStampDuty(state, base)).toBe(expected)
                // The resolved rate must match what stampDutyRateForState reports.
                expect(stampDutyRateForState(state)).toBe(expectedRate)
            })
        )
    })
})

// ---------------------------------------------------------------------------
// Property 15: GST rate is total over project status (Req 3.6, 3.7, 3.8)
// ---------------------------------------------------------------------------

const statusArb: fc.Arbitrary<string> = fc.oneof(
    fc.constantFrom('Upcoming', 'UnderConstruction', 'ReadyToMove'),
    fc.string()
)

describe('Property 15: GST rate is total over project status', () => {
    // Feature: real-estate-crm, Property 15: For any project status, the GST rate is determinate and equals 5% when Under Construction, 0% when Ready to Move, and 5% for any other status.
    it('GST rate is determinate: 5% UnderConstruction, 0% ReadyToMove, 5% otherwise', () => {
        fcAssert(
            fc.property(statusArb, (status) => {
                const rate = gstRateForProject(status)

                // Total function: always returns a finite, determinate number.
                expect(typeof rate).toBe('number')
                expect(Number.isFinite(rate)).toBe(true)

                if (status === 'UnderConstruction') {
                    expect(rate).toBe(GST_RATE_UNDER_CONSTRUCTION)
                    expect(rate).toBe(0.05)
                } else if (status === 'ReadyToMove') {
                    expect(rate).toBe(GST_RATE_READY_TO_MOVE)
                    expect(rate).toBe(0)
                } else {
                    expect(rate).toBe(GST_RATE_DEFAULT)
                    expect(rate).toBe(0.05)
                }
            })
        )
    })
})

// ---------------------------------------------------------------------------
// Property 16: Milestone amounts sum to the basis amount (Req 3.11, 5.5)
// ---------------------------------------------------------------------------

const milestoneArb = fc.record({
    name: fc.string(),
    dueOffsetDays: fc.nat({ max: 3650 }),
    percentage: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
})

const planArb: fc.Arbitrary<PaymentPlanInput> = fc.record({
    name: fc.string(),
    milestones: fc.array(milestoneArb, { minLength: 1, maxLength: 12 }),
})

describe('Property 16: Milestone amounts sum to the basis amount', () => {
    // Feature: real-estate-crm, Property 16: For any payment plan and basis amount, the sum of generated milestone amounts equals the basis amount exactly.
    it('sum of milestone amounts equals the basis amount exactly', () => {
        fcAssert(
            fc.property(planArb, moneyArb, (plan, basis) => {
                const milestones = splitMilestones(plan, basis)

                // One amount is produced per plan milestone.
                expect(milestones).toHaveLength(plan.milestones.length)

                const total = roundMoney(milestones.reduce((acc, m) => acc + m.amount, 0))
                expect(total).toBe(roundMoney(basis))
            })
        )
    })
})
