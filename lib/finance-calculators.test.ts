import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
    loanEligibility,
    rentalYield,
    appreciationProjection,
    gstAmount,
} from './finance-calculators'

describe('loanEligibility', () => {
    it('eligible loan never exceeds maxEMI × tenure (interest only reduces capacity)', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 5_000_000, noNaN: true }),
                fc.double({ min: 0, max: 1_000_000, noNaN: true }),
                fc.double({ min: 0, max: 20, noNaN: true }),
                fc.integer({ min: 1, max: 360 }),
                (income, obligations, rate, tenure) => {
                    const { maxEmi, eligibleLoan } = loanEligibility({
                        monthlyIncome: income,
                        monthlyObligations: obligations,
                        annualRatePct: rate,
                        tenureMonths: tenure,
                    })
                    expect(eligibleLoan).toBeGreaterThanOrEqual(0)
                    // Reverse-amortized principal can never exceed the undiscounted sum.
                    expect(eligibleLoan).toBeLessThanOrEqual(maxEmi * tenure + 0.01)
                },
            ),
            { numRuns: 100 },
        )
    })

    it('higher income yields a higher or equal eligible loan', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 20_000, max: 500_000, noNaN: true }),
                fc.double({ min: 5, max: 12, noNaN: true }),
                fc.integer({ min: 12, max: 360 }),
                (income, rate, tenure) => {
                    const base = loanEligibility({ monthlyIncome: income, annualRatePct: rate, tenureMonths: tenure })
                    const more = loanEligibility({ monthlyIncome: income * 1.5, annualRatePct: rate, tenureMonths: tenure })
                    expect(more.eligibleLoan).toBeGreaterThanOrEqual(base.eligibleLoan)
                },
            ),
            { numRuns: 100 },
        )
    })

    it('zero-rate eligibility equals maxEMI × tenure', () => {
        const { maxEmi, eligibleLoan } = loanEligibility({ monthlyIncome: 100_000, annualRatePct: 0, tenureMonths: 240 })
        expect(eligibleLoan).toBeCloseTo(maxEmi * 240, 0)
    })
})

describe('rentalYield', () => {
    it('gross yield is at least net yield when expenses are non-negative', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 1, max: 100_000_000, noNaN: true }),
                fc.double({ min: 0, max: 1_000_000, noNaN: true }),
                fc.double({ min: 0, max: 1_000_000, noNaN: true }),
                (value, rent, expenses) => {
                    const r = rentalYield({ propertyValue: value, monthlyRent: rent, annualExpenses: expenses })
                    expect(r.grossYieldPct + 1e-9).toBeGreaterThanOrEqual(r.netYieldPct)
                },
            ),
            { numRuns: 100 },
        )
    })

    it('zero property value yields 0% (no divide-by-zero)', () => {
        const r = rentalYield({ propertyValue: 0, monthlyRent: 25000 })
        expect(r.grossYieldPct).toBe(0)
        expect(r.netYieldPct).toBe(0)
    })
})

describe('appreciationProjection', () => {
    it('non-negative growth never decreases value and schedule length equals years', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 100_000, max: 100_000_000, noNaN: true }),
                fc.double({ min: 0, max: 30, noNaN: true }),
                fc.integer({ min: 0, max: 50 }),
                (value, growth, years) => {
                    const res = appreciationProjection({ currentValue: value, annualGrowthPct: growth, years })
                    expect(res.schedule.length).toBe(years)
                    // futureValue is rounded to 2dp, so compare against value at rounding scale.
                    expect(res.futureValue + 0.01).toBeGreaterThanOrEqual(value)
                    expect(res.totalGain + 0.01).toBeGreaterThanOrEqual(0)
                    // Monotonic non-decreasing for non-negative growth.
                    for (let i = 1; i < res.schedule.length; i++) {
                        expect(res.schedule[i].value + 0.01).toBeGreaterThanOrEqual(res.schedule[i - 1].value)
                    }
                },
            ),
            { numRuns: 100 },
        )
    })
})

describe('gstAmount', () => {
    it('equals base × rate', () => {
        expect(gstAmount(5_000_000, 0.05)).toBe(250_000)
        expect(gstAmount(5_000_000, 0)).toBe(0)
    })
})
