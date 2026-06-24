/**
 * Team-leaderboard and gamification pure helpers (Module 10).
 *
 * Every function in this module is PURE: it performs no DB/IO, does not read
 * the global clock, and does not call `Math.random()`. This keeps the helpers
 * deterministic and property-testable. Persistence (`AgentScore`, `Badge`,
 * `AgentBadge`) and award-once-per-period semantics live in the
 * Gamification_Service server actions, not here.
 *
 * Requirements:
 *   - 13.3 — Leaderboard ranking: rank agents by a selected metric in
 *            non-increasing order with deterministic tie-breaking
 *            (design Property 48).
 *   - 13.4 — Badge-criteria evaluation: decide whether an agent's metrics
 *            satisfy a badge's criteria for a period (design Property 49 is
 *            enforced at the service layer via a unique constraint; this
 *            module provides the pure "is earned?" decision).
 */

/**
 * An agent's score record for a single period. `metrics` is an open map of
 * metric name to numeric value, mirroring the `AgentScore.metrics` JSON column
 * (e.g. `{ deals: 12, revenue: 4500000, siteVisits: 30 }`). A metric that is
 * absent from the map is treated as `0` for ranking and criteria evaluation.
 */
export interface AgentScoreEntry {
    /** Identifier of the agent (Staff) this score belongs to. */
    staffId: number
    /** Metric name -> value map (the `AgentScore.metrics` JSON). */
    metrics: Record<string, number>
}

/** A single ranked leaderboard row for a selected metric. */
export interface LeaderboardRow {
    /** 1-based rank position after ordering by the selected metric. */
    rank: number
    /** The ranked agent's Staff id. */
    staffId: number
    /** The value of the selected metric for this agent (absent metric -> 0). */
    value: number
}

/**
 * Read a metric value out of a metrics map, treating an absent or non-finite
 * value as `0`. This keeps ranking and criteria evaluation total: every agent
 * has a well-defined value for every metric.
 */
function metricValue(metrics: Record<string, number>, metric: string): number {
    const raw = metrics?.[metric]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

/**
 * Rank agents for a selected metric.
 *
 * Agents are ordered in non-increasing order of the selected metric (highest
 * first). Ties are broken deterministically by ascending `staffId` so the
 * output is a total, stable order independent of input ordering. Each row is
 * assigned a 1-based positional `rank`, so for adjacent rows `value[i] >=
 * value[i + 1]` always holds (design Property 48, Req 13.3).
 *
 * The input is not mutated.
 *
 * @param scores The agent scores to rank.
 * @param metric The metric name to rank by; agents missing the metric rank as `0`.
 * @returns A new array of `LeaderboardRow` ordered by descending metric value.
 */
export function rankLeaderboard(
    scores: AgentScoreEntry[],
    metric: string
): LeaderboardRow[] {
    if (typeof metric !== 'string' || metric.length === 0) {
        throw new Error(
            `rankLeaderboard expects a non-empty metric name, received: ${String(metric)}`
        )
    }

    return [...scores]
        .map((entry) => ({
            staffId: entry.staffId,
            value: metricValue(entry.metrics, metric),
        }))
        .sort((a, b) => {
            // Primary: metric value, descending (non-increasing order).
            if (b.value !== a.value) return b.value - a.value
            // Tie-break: ascending staffId for a deterministic total order.
            return a.staffId - b.staffId
        })
        .map((row, index) => ({
            rank: index + 1,
            staffId: row.staffId,
            value: row.value,
        }))
}

/**
 * Comparison operators supported by a structured badge requirement.
 *   - `gte` (default): metric >= value
 *   - `gt` : metric >  value
 *   - `lte`: metric <= value
 *   - `lt` : metric <  value
 *   - `eq` : metric === value
 */
export type CriterionOperator = 'gte' | 'gt' | 'lte' | 'lt' | 'eq'

/**
 * A structured requirement on a single metric. Use this form when an operator
 * other than the default `gte` is needed (e.g. `{ op: 'lte', value: 5 }`).
 */
export interface StructuredCriterion {
    op: CriterionOperator
    value: number
}

/**
 * A single criterion value. A bare number is shorthand for `>= number`
 * (the most common "reach this threshold" badge rule); a `StructuredCriterion`
 * allows an explicit operator.
 */
export type CriterionValue = number | StructuredCriterion

/**
 * A badge's criteria: a map of metric name to the requirement on that metric,
 * mirroring the `Badge.criteria` JSON column. A badge is earned when an agent
 * satisfies **all** entries (logical AND). An empty/absent criteria map imposes
 * no requirements and is therefore vacuously satisfied.
 *
 * Example: `{ deals: 10, npsScore: { op: 'gte', value: 8 } }`.
 */
export type BadgeCriteria = Record<string, CriterionValue>

function satisfiesCriterion(actual: number, criterion: CriterionValue): boolean {
    // Bare number shorthand: actual >= threshold.
    if (typeof criterion === 'number') {
        if (!Number.isFinite(criterion)) {
            throw new Error(
                `Badge criterion threshold must be finite, received: ${String(criterion)}`
            )
        }
        return actual >= criterion
    }

    if (
        criterion == null ||
        typeof criterion !== 'object' ||
        typeof criterion.value !== 'number' ||
        !Number.isFinite(criterion.value)
    ) {
        throw new Error(
            `Invalid badge criterion: ${JSON.stringify(criterion)}`
        )
    }

    switch (criterion.op) {
        case 'gte':
            return actual >= criterion.value
        case 'gt':
            return actual > criterion.value
        case 'lte':
            return actual <= criterion.value
        case 'lt':
            return actual < criterion.value
        case 'eq':
            return actual === criterion.value
        default: {
            const _exhaustive: never = criterion.op
            throw new Error(
                `Unsupported badge criterion operator: ${String(_exhaustive)}`
            )
        }
    }
}

/**
 * Decide whether an agent's metrics satisfy a badge's criteria.
 *
 * A badge is earned when every entry in `criteria` is satisfied by the
 * corresponding metric value (a missing metric is treated as `0`). With no
 * criteria the badge is vacuously earned. This is the pure decision used by
 * `awardBadges` in the service layer to determine eligibility before applying
 * the once-per-period unique constraint (Req 13.4, design Property 49).
 *
 * @param metrics  The agent's metric map for the period.
 * @param criteria The badge's criteria map.
 * @returns `true` iff all criteria are met.
 */
export function isBadgeEarned(
    metrics: Record<string, number>,
    criteria: BadgeCriteria
): boolean {
    const entries = Object.entries(criteria ?? {})
    for (const [metric, criterion] of entries) {
        if (!satisfiesCriterion(metricValue(metrics, metric), criterion)) {
            return false
        }
    }
    return true
}
