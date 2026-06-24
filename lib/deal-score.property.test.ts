/**
 * Property-based tests for the AI Deal Predictor pure scorer in
 * `lib/deal-score.ts` (Module 14).
 *
 * These implement the following numbered design properties (design.md →
 * Correctness Properties → AI Deal Predictor):
 *
 *   - Property 57 — Deal score is bounded and clamped     (Req 17.1)
 *   - Property 58 — Token payment forces a high score      (Req 17.2)
 *   - Property 59 — Hot deal threshold                     (Req 17.4)
 *   - Property 60 — At-risk classification                 (Req 17.6)
 *
 * Only the pure, IO-free scoring logic is exercised: `computeDealScore` derives
 * an integer probability score, `isHotDeal` and `isAtRiskDeal` classify a
 * score. All tests run with the project default of 100 iterations via
 * `fcAssert`.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
    AT_RISK_INACTIVITY_DAYS,
    AT_RISK_SCORE_THRESHOLD,
    HOT_SCORE_THRESHOLD,
    SCORE_MAX,
    SCORE_MIN,
    TOKEN_SCORE_FLOOR,
    computeDealScore,
    isAtRiskDeal,
    isHotDeal,
    type DealScoreInput,
    type DealSignals,
} from '@/lib/deal-score'
import { fcAssert, scoreArb } from '@/test/generators'

// ---------------------------------------------------------------------------
// Local arbitraries
// ---------------------------------------------------------------------------

/**
 * A "wild" real number that deliberately spans well beyond the documented
 * input domains (negatives, huge magnitudes, zero) so that the scorer's
 * normalization/clamping paths are exercised. Finite only — the scorer's
 * own `clamp01` maps non-finite inputs to 0, which is covered separately.
 */
const wildNumberArb: fc.Arbitrary<number> = fc.oneof(
    fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
    fc.constantFrom(-1, 0, 0.5, 1, 2, 3, 24, 100),
)

/** Days-since values, including negatives (treated as 0) and large gaps. */
const daysArb: fc.Arbitrary<number> = fc.oneof(
    fc.integer({ min: -10, max: 365 }),
    fc.double({ min: -10, max: 1000, noNaN: true, noDefaultInfinity: true }),
)

/** Engagement signals across (and beyond) their documented ranges. */
const signalsArb: fc.Arbitrary<DealSignals> = fc.record({
    siteVisits: wildNumberArb,
    responseTimeHours: wildNumberArb,
    kycUploaded: fc.boolean(),
    budgetRatio: wildNumberArb,
    sourceQuality: wildNumberArb,
    costSheetViewed: fc.boolean(),
})

/** Deal-level facts, with token payment freely toggled. */
function dealArb(hasToken?: boolean): fc.Arbitrary<DealScoreInput> {
    return fc.record({
        hasTokenPayment: hasToken === undefined ? fc.boolean() : fc.constant(hasToken),
        daysSinceEngagement: daysArb,
    })
}

// ---------------------------------------------------------------------------
// Property 57 — Deal score is bounded and clamped (Req 17.1)
// ---------------------------------------------------------------------------

describe('computeDealScore — bounded & clamped (Property 57)', () => {
    // Feature: real-estate-crm, Property 57: Deal score is bounded and clamped
    it('returns an integer within [0, 100] for any combination of deal signals', () => {
        fcAssert(
            fc.property(dealArb(), signalsArb, (deal, signals) => {
                const score = computeDealScore(deal, signals)
                expect(Number.isInteger(score)).toBe(true)
                expect(score).toBeGreaterThanOrEqual(SCORE_MIN)
                expect(score).toBeLessThanOrEqual(SCORE_MAX)
            }),
        )
    })

    // Feature: real-estate-crm, Property 57: Deal score is bounded and clamped
    it('clamps even when signals carry non-finite or extreme values', () => {
        const extremeArb = fc.constantFrom(
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
            Number.MAX_VALUE,
            -Number.MAX_VALUE,
        )
        const extremeSignalsArb: fc.Arbitrary<DealSignals> = fc.record({
            siteVisits: extremeArb,
            responseTimeHours: extremeArb,
            kycUploaded: fc.boolean(),
            budgetRatio: extremeArb,
            sourceQuality: extremeArb,
            costSheetViewed: fc.boolean(),
        })

        fcAssert(
            fc.property(dealArb(), extremeSignalsArb, (deal, signals) => {
                const score = computeDealScore(deal, signals)
                expect(Number.isInteger(score)).toBe(true)
                expect(score).toBeGreaterThanOrEqual(SCORE_MIN)
                expect(score).toBeLessThanOrEqual(SCORE_MAX)
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 58 — Token payment forces a high score (Req 17.2)
// ---------------------------------------------------------------------------

describe('computeDealScore — token payment forces high score (Property 58)', () => {
    // Feature: real-estate-crm, Property 58: Token payment forces a high score
    it('forces the score into [90, 100] whenever a token payment exists, overriding weighted factors', () => {
        fcAssert(
            fc.property(dealArb(true), signalsArb, (deal, signals) => {
                const score = computeDealScore(deal, signals)
                expect(score).toBeGreaterThanOrEqual(TOKEN_SCORE_FLOOR)
                expect(score).toBeLessThanOrEqual(SCORE_MAX)
            }),
        )
    })

    // Feature: real-estate-crm, Property 58: Token payment forces a high score
    it('overrides an otherwise-zero weighted result (all factors minimal) up into the band', () => {
        // Worst-possible weighted signals: no visits, slow response, no KYC,
        // zero budget/source, stale engagement, no cost sheet.
        const minimalSignals: DealSignals = {
            siteVisits: 0,
            responseTimeHours: 1000,
            kycUploaded: false,
            budgetRatio: 0,
            sourceQuality: 0,
            costSheetViewed: false,
        }
        fcAssert(
            fc.property(daysArb, (days) => {
                const score = computeDealScore(
                    { hasTokenPayment: true, daysSinceEngagement: Math.max(days, 365) },
                    minimalSignals,
                )
                expect(score).toBeGreaterThanOrEqual(TOKEN_SCORE_FLOOR)
                expect(score).toBeLessThanOrEqual(SCORE_MAX)
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 59 — Hot deal threshold (Req 17.4)
// ---------------------------------------------------------------------------

describe('isHotDeal — hot threshold (Property 59)', () => {
    // Feature: real-estate-crm, Property 59: Hot deal threshold
    it('marks a deal Hot if and only if its score is strictly greater than 80', () => {
        fcAssert(
            fc.property(scoreArb, (score) => {
                expect(isHotDeal(score)).toBe(score > HOT_SCORE_THRESHOLD)
            }),
        )
    })

    // Feature: real-estate-crm, Property 59: Hot deal threshold
    it('is consistent with computeDealScore output (Hot iff computed score > 80)', () => {
        fcAssert(
            fc.property(dealArb(), signalsArb, (deal, signals) => {
                const score = computeDealScore(deal, signals)
                expect(isHotDeal(score)).toBe(score > HOT_SCORE_THRESHOLD)
            }),
        )
    })
})

// ---------------------------------------------------------------------------
// Property 60 — At-risk classification (Req 17.6)
// ---------------------------------------------------------------------------

describe('isAtRiskDeal — at-risk classification (Property 60)', () => {
    // Feature: real-estate-crm, Property 60: At-risk classification
    it('marks a deal At Risk iff score < 30 AND no activity for 7+ consecutive days', () => {
        const daysSinceActivityArb = fc.oneof(
            fc.integer({ min: -5, max: 60 }),
            fc.double({ min: -5, max: 60, noNaN: true, noDefaultInfinity: true }),
        )
        fcAssert(
            fc.property(scoreArb, daysSinceActivityArb, (score, days) => {
                const expected =
                    score < AT_RISK_SCORE_THRESHOLD && days >= AT_RISK_INACTIVITY_DAYS
                expect(isAtRiskDeal(score, days)).toBe(expected)
            }),
        )
    })

    // Feature: real-estate-crm, Property 60: At-risk classification
    it('is not At Risk when either condition fails (high score or recent activity)', () => {
        // High score (>= 30) never at risk, regardless of inactivity.
        fcAssert(
            fc.property(
                fc.integer({ min: AT_RISK_SCORE_THRESHOLD, max: SCORE_MAX }),
                fc.integer({ min: 0, max: 60 }),
                (score, days) => {
                    expect(isAtRiskDeal(score, days)).toBe(false)
                },
            ),
        )
        // Recent activity (< 7 days) never at risk, regardless of score.
        fcAssert(
            fc.property(
                scoreArb,
                fc.integer({ min: 0, max: AT_RISK_INACTIVITY_DAYS - 1 }),
                (score, days) => {
                    expect(isAtRiskDeal(score, days)).toBe(false)
                },
            ),
        )
    })
})
