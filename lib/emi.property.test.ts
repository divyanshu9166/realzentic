/**
 * Property-based tests for the EMI & Affordability pure helpers (`lib/emi.ts`).
 *
 * Implements design correctness properties 38–39 (EMI Calculator) using
 * `fast-check` on the Vitest runner. Each property runs the project default of
 * 100 iterations via {@link fcAssert} and carries the required property-tag
 * comment:
 *
 *   // Feature: real-estate-crm, Property N: <text>
 *
 * Requirements: 10.1 (EMI / amortization consistency), 10.6 (down-payment guard).
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { computeEmi, amortizationSchedule, validateDownPayment } from '@/lib/emi'
import { roundMoney, MONEY_MAX } from '@/lib/money'
import { fcAssert, moneyArb } from '@/test/generators'

// ---------------------------------------------------------------------------
// Local arbitraries
// ---------------------------------------------------------------------------

/**
 * A loan principal constrained to half the money range and rounded to 2 dp.
 * Halving the range leaves headroom so that the level EMI (which for a 1-month
 * tenure is `P · (1 + r)`) never overflows the inclusive money range.
 */
const principalArb: fc.Arbitrary<number> = fc
    .double({ min: 0, max: MONEY_MAX / 2, noNaN: true, noDefaultInfinity: true })
    .map((n) => roundMoney(n))

/**
 * An annual interest rate in percent. A realistic rate is either exactly zero
 * (exercising the straight-line, zero-interest branch) or a normal-magnitude
 * positive percentage in `0.01 … 40`. We deliberately exclude subnormal
 * doubles (e.g. `1e-321`): they are not meaningful financial rates, and at that
 * magnitude `(1 + r)^n` rounds to exactly `1`, which is outside the intended
 * input space for the amortization formula.
 */
const annualRateArb: fc.Arbitrary<number> = fc.oneof(
    fc.constant(0),
    fc.double({ min: 0.01, max: 40, noNaN: true, noDefaultInfinity: true })
)

/** A loan tenure as a positive integer number of months, `1 … 480` (40 years). */
const tenureArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 480 })

/** Independently re-derive the expected level EMI from the standard formula. */
function expectedEmi(principal: number, annualRatePct: number, tenureMonths: number): number {
    const r = annualRatePct / 12 / 100
    if (r === 0) {
        return roundMoney(principal / tenureMonths)
    }
    const growth = Math.pow(1 + r, tenureMonths)
    return roundMoney((principal * r * growth) / (growth - 1))
}

// ---------------------------------------------------------------------------
// Property 38: EMI computation and amortization consistency (Req 10.1)
// ---------------------------------------------------------------------------

describe('Property 38: EMI computation and amortization consistency', () => {
    // Feature: real-estate-crm, Property 38: For any principal, annual interest rate, and tenure in months, the computed monthly EMI matches the standard amortization formula, the amortization schedule's principal repayments sum to the principal, and the final outstanding balance is approximately zero.
    it('EMI matches the formula; principal repayments sum to principal; final balance is zero', () => {
        fcAssert(
            fc.property(principalArb, annualRateArb, tenureArb, (principal, rate, tenure) => {
                // 1. The EMI matches the standard amortization formula.
                expect(computeEmi(principal, rate, tenure)).toBe(expectedEmi(principal, rate, tenure))

                const schedule = amortizationSchedule(principal, rate, tenure)

                // One row per month, indexed 1..tenure.
                expect(schedule).toHaveLength(tenure)
                expect(schedule[tenure - 1].month).toBe(tenure)

                // 2. The principal components sum EXACTLY to the original principal.
                const principalSum = roundMoney(
                    schedule.reduce((acc, row) => acc + row.principal, 0)
                )
                expect(principalSum).toBe(roundMoney(principal))

                // 3. The final outstanding balance is exactly zero.
                expect(schedule[tenure - 1].balance).toBe(0)
            })
        )
    })
})

// ---------------------------------------------------------------------------
// Property 39: Down payment must be below property value (Req 10.6)
// ---------------------------------------------------------------------------

/**
 * `(propertyValue, downPayment)` pairs covering three regimes:
 *  - independent arbitrary pairs (full characterization),
 *  - forced `downPayment >= propertyValue` (the rejected branch),
 *  - forced `downPayment < propertyValue` (the accepted branch).
 */
const dpPairArb: fc.Arbitrary<[number, number]> = fc.oneof(
    fc.tuple(moneyArb, moneyArb),
    // downPayment = propertyValue + extra  (>= propertyValue), clamped to range.
    fc
        .tuple(moneyArb, moneyArb)
        .map(([pv, extra]) => [pv, Math.min(roundMoney(pv + extra), MONEY_MAX)] as [number, number]),
    // downPayment = propertyValue * fraction  (< propertyValue when fraction < 1).
    fc
        .tuple(moneyArb, fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }))
        .map(([pv, frac]) => [pv, roundMoney(pv * frac)] as [number, number])
)

describe('Property 39: Down payment must be below property value', () => {
    // Feature: real-estate-crm, Property 39: For any property value and down payment where down payment is greater than or equal to property value, a validation error is returned and no EMI is computed.
    it('rejects down payments >= property value so no positive principal (EMI) is computed', () => {
        fcAssert(
            fc.property(dpPairArb, ([propertyValue, downPayment]) => {
                const accepted = validateDownPayment(propertyValue, downPayment)

                // Full characterization: accepted iff a strictly positive financed
                // principal results (down payment non-negative and below value).
                const expected = downPayment >= 0 && downPayment < propertyValue
                expect(accepted).toBe(expected)

                if (!accepted) {
                    // Rejected: the financed principal (value − downPayment) is not
                    // positive, so the caller computes no EMI.
                    expect(propertyValue - downPayment).toBeLessThanOrEqual(0)
                }
            })
        )
    })
})
