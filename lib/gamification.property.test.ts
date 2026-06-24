/**
 * Property-based tests for the gamification leaderboard pure helper
 * ({@link rankLeaderboard} in `lib/gamification.ts`).
 *
 * Implements design Correctness Property 48:
 *   - Property 48: Leaderboard ranking order (Req 13.3)
 *
 * Tag convention (design.md → Testing Strategy → PBT):
 *   // Feature: real-estate-crm, Property N: <text>
 *
 * Runs at the project default of 100 iterations via `fcAssert`.
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { rankLeaderboard, type AgentScoreEntry } from '@/lib/gamification'
import { fcAssert } from '@/test/generators'

/** A metric name drawn from a small fixed pool so collisions/ties are common. */
const metricNameArb: fc.Arbitrary<string> = fc.constantFrom(
    'deals',
    'revenue',
    'siteVisits',
    'npsScore',
)

/**
 * A finite numeric metric value. A small max range plus integer bias makes
 * equal values (and therefore tie-breaks) frequent during ranking.
 */
const metricMetricValueArb: fc.Arbitrary<number> = fc.oneof(
    fc.integer({ min: 0, max: 10 }),
    fc.double({ min: -1000, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
)

/**
 * A metrics map: an open record of metric name -> value. The selected metric
 * may be present or absent (absent is treated as 0 by the helper), so both the
 * present and missing-metric branches are exercised.
 */
const metricsArb: fc.Arbitrary<Record<string, number>> = fc.dictionary(
    metricNameArb,
    metricMetricValueArb,
    { maxKeys: 4 },
)

/**
 * A set of agent score entries with DISTINCT staffIds. Distinct ids guarantee
 * the tie-break key (ascending staffId) yields a strict total order, which the
 * property asserts. staffId uniqueness mirrors the one-score-per-agent domain.
 */
const scoresArb: fc.Arbitrary<AgentScoreEntry[]> = fc
    .uniqueArray(fc.integer({ min: 1, max: 10_000 }), {
        minLength: 0,
        maxLength: 12,
    })
    .chain((staffIds) =>
        fc.tuple(
            ...staffIds.map((staffId) =>
                metricsArb.map((metrics) => ({ staffId, metrics })),
            ),
        ),
    )

/** Read a metric the same way the helper does: absent/non-finite -> 0. */
function metricValue(metrics: Record<string, number>, metric: string): number {
    const raw = metrics?.[metric]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

describe('rankLeaderboard (pure helper)', () => {
    // Feature: real-estate-crm, Property 48: Leaderboard ranking order
    // For any set of agent scores, the leaderboard for a selected metric is
    // ordered in non-increasing order of that metric, so each rank's metric
    // value is greater than or equal to the next, with ties broken
    // deterministically by ascending staffId.
    // Validates: Requirements 13.3
    it('Property 48: ranks non-increasingly by metric with deterministic tie-breaking', () => {
        fcAssert(
            fc.property(scoresArb, metricNameArb, (scores, metric) => {
                const ranked = rankLeaderboard(scores, metric)

                // Same population: one row per input agent, no additions/drops.
                expect(ranked).toHaveLength(scores.length)
                expect([...ranked.map((r) => r.staffId)].sort((a, b) => a - b)).toEqual(
                    [...scores.map((s) => s.staffId)].sort((a, b) => a - b),
                )

                for (let i = 0; i < ranked.length; i++) {
                    const row = ranked[i]

                    // 1-based positional ranks.
                    expect(row.rank).toBe(i + 1)

                    // Reported value matches the selected metric (absent -> 0).
                    const source = scores.find((s) => s.staffId === row.staffId)!
                    expect(row.value).toBe(metricValue(source.metrics, metric))

                    if (i > 0) {
                        const prev = ranked[i - 1]
                        // Non-increasing over the selected metric.
                        expect(prev.value).toBeGreaterThanOrEqual(row.value)
                        // Deterministic tie-break: equal values -> ascending staffId.
                        if (prev.value === row.value) {
                            expect(prev.staffId).toBeLessThan(row.staffId)
                        }
                    }
                }
            }),
        )
    })

    // Feature: real-estate-crm, Property 48: Leaderboard ranking order
    // Ranking is independent of input ordering: permuting the input yields the
    // same leaderboard (the order is a total, stable function of the values and
    // staffIds, not of input position).
    // Validates: Requirements 13.3
    it('Property 48: ranking is invariant under input permutation', () => {
        fcAssert(
            fc.property(scoresArb, metricNameArb, (scores, metric) => {
                const ranked = rankLeaderboard(scores, metric)
                const shuffled = [...scores].reverse()
                const rankedShuffled = rankLeaderboard(shuffled, metric)
                expect(rankedShuffled).toEqual(ranked)
            }),
        )
    })
})
