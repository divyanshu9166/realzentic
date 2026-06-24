/**
 * AI Deal Predictor — pure deal-scoring logic (Module 14).
 *
 * Everything in this file is a PURE function (no DB/IO). Persistence,
 * notifications and scheduling live in `app/actions/ai-deal-predictor.ts`.
 *
 * `computeDealScore(deal, signals)` produces an integer probability score in
 * the inclusive range `[0, 100]` by applying the design's weighted factors and
 * clamping the result. When a token payment exists on the deal, the score is
 * forced into the `[90, 100]` band, overriding the weighted-factor result.
 *
 * The weighted factors (and their weights, summing to 100) are:
 *
 *   | Factor                 | Weight | Source                    |
 *   | ---------------------- | ------ | ------------------------- |
 *   | site visits            |  ×15   | signals.siteVisits        |
 *   | response time          |  ×10   | signals.responseTimeHours |
 *   | KYC uploaded           |  ×20   | signals.kycUploaded       |
 *   | budget ratio           |  ×10   | signals.budgetRatio       |
 *   | days since engagement  |  ×15   | deal.daysSinceEngagement  |
 *   | source quality         |  ×10   | signals.sourceQuality     |
 *   | cost sheet viewed      |  ×10   | signals.costSheetViewed   |
 *   | token paid             |  ×10   | deal.hasTokenPayment      |
 *
 * Requirements: 17.1 (weighted/clamped), 17.2 (token forces 90–100),
 * 17.4 (hot threshold), 17.6 (at-risk classification).
 */

/** A computed score is a Hot Deal when it is strictly greater than this. */
export const HOT_SCORE_THRESHOLD = 80
/** At-risk applies only when the score is strictly below this. */
export const AT_RISK_SCORE_THRESHOLD = 30
/** At-risk applies only after this many consecutive days without activity. */
export const AT_RISK_INACTIVITY_DAYS = 7
/** Lower bound of the forced band applied when a token payment exists. */
export const TOKEN_SCORE_FLOOR = 90
/** Inclusive lower/upper bounds of any deal score. */
export const SCORE_MIN = 0
export const SCORE_MAX = 100

/**
 * The number of site visits at (or above) which the site-visit factor is
 * considered fully satisfied.
 */
const SITE_VISIT_SATURATION = 3
/**
 * Response time (in hours) at (or above) which the response-time factor
 * contributes nothing. Faster responses score higher, linearly.
 */
const RESPONSE_TIME_CEILING_HOURS = 24
/**
 * Decay constant (in days) for the days-since-engagement factor. The factor
 * follows exponential decay `e^(-days / DECAY)`, so recent engagement scores
 * near 1 and older engagement decays smoothly toward 0.
 */
const ENGAGEMENT_DECAY_DAYS = 14

/** Deal-level facts used by the scorer. */
export interface DealScoreInput {
    /** Whether a token payment has been recorded against the deal (Req 17.2). */
    hasTokenPayment: boolean
    /**
     * Days elapsed since the most recent logged engagement/activity. Used for
     * the time-decayed "days since engagement" factor. Negative values are
     * treated as 0 (i.e. engaged today).
     */
    daysSinceEngagement: number
}

/** Engagement signals contributing to the weighted score. */
export interface DealSignals {
    /** Number of site visits logged for the deal (≥ 0). */
    siteVisits: number
    /** Average first-response time in hours (≥ 0); lower is better. */
    responseTimeHours: number
    /** Whether KYC documents have been uploaded. */
    kycUploaded: boolean
    /**
     * Ratio of the buyer's budget consumed by the deal value, typically in
     * `[0, 1]`. Values are clamped to `[0, 1]`; a higher ratio (closer to a
     * committed budget) scores higher.
     */
    budgetRatio: number
    /** Source-quality score in `[0, 1]`; clamped if out of range. */
    sourceQuality: number
    /** Whether the buyer has viewed the cost sheet. */
    costSheetViewed: boolean
}

/** Clamp a value into the inclusive `[0, 1]` range; non-finite -> 0. */
function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0
    if (value <= 0) return 0
    if (value >= 1) return 1
    return value
}

/** Map a boolean factor to its `[0, 1]` contribution. */
function bool01(flag: boolean): number {
    return flag ? 1 : 0
}

/**
 * Compute a deal's probability score.
 *
 * The eight weighted factors are each normalized to `[0, 1]`, multiplied by
 * their weight, summed, rounded to the nearest integer, and clamped to
 * `[0, 100]`. If `deal.hasTokenPayment` is true, the final score is forced to
 * at least {@link TOKEN_SCORE_FLOOR}, placing it in the `[90, 100]` band and
 * overriding the weighted result (Req 17.2).
 *
 * @returns an integer in `[0, 100]`.
 */
export function computeDealScore(deal: DealScoreInput, signals: DealSignals): number {
    // --- Normalize each factor to [0, 1] ---------------------------------

    // Site visits: saturates once SITE_VISIT_SATURATION visits are reached.
    const siteVisitFactor = clamp01(
        Math.max(0, signals.siteVisits) / SITE_VISIT_SATURATION
    )

    // Response time: faster is better; linear from 1 (instant) to 0 (>= ceiling).
    const responseTimeFactor = clamp01(
        1 - Math.max(0, signals.responseTimeHours) / RESPONSE_TIME_CEILING_HOURS
    )

    // KYC uploaded: binary.
    const kycFactor = bool01(signals.kycUploaded)

    // Budget ratio: clamped to [0, 1].
    const budgetFactor = clamp01(signals.budgetRatio)

    // Days since engagement: exponential time-based decay.
    const days = Math.max(0, deal.daysSinceEngagement)
    const engagementFactor = clamp01(Math.exp(-days / ENGAGEMENT_DECAY_DAYS))

    // Source quality: clamped to [0, 1].
    const sourceFactor = clamp01(signals.sourceQuality)

    // Cost sheet viewed: binary.
    const costSheetFactor = bool01(signals.costSheetViewed)

    // Token paid: binary (also drives the forced band below).
    const tokenFactor = bool01(deal.hasTokenPayment)

    // --- Apply weights (sum of weights = 100) ----------------------------
    const weighted =
        15 * siteVisitFactor +
        10 * responseTimeFactor +
        20 * kycFactor +
        10 * budgetFactor +
        15 * engagementFactor +
        10 * sourceFactor +
        10 * costSheetFactor +
        10 * tokenFactor

    // Round to an integer and clamp to [0, 100] (Req 17.1).
    let score = clampScore(Math.round(weighted))

    // Token payment forces the score into [90, 100] (Req 17.2). Since `score`
    // is already <= 100, raising its floor to 90 keeps it within the band.
    if (deal.hasTokenPayment) {
        score = clampScore(Math.max(score, TOKEN_SCORE_FLOOR))
    }

    return score
}

/** Clamp an integer score to the inclusive `[0, 100]` range. */
export function clampScore(score: number): number {
    if (!Number.isFinite(score)) return SCORE_MIN
    if (score < SCORE_MIN) return SCORE_MIN
    if (score > SCORE_MAX) return SCORE_MAX
    return score
}

/**
 * Hot-deal classifier (Req 17.4 / design Property 59).
 *
 * A deal is Hot if and only if its score is strictly greater than
 * {@link HOT_SCORE_THRESHOLD} (80).
 */
export function isHotDeal(score: number): boolean {
    return score > HOT_SCORE_THRESHOLD
}

/**
 * At-risk classifier (Req 17.6 / design Property 60).
 *
 * A deal is At Risk if and only if its score is strictly less than
 * {@link AT_RISK_SCORE_THRESHOLD} (30) AND it has had no logged activity for
 * {@link AT_RISK_INACTIVITY_DAYS} (7) or more consecutive days.
 *
 * @param score                  the deal's current score.
 * @param daysSinceLastActivity  consecutive days with no logged activity.
 */
export function isAtRiskDeal(score: number, daysSinceLastActivity: number): boolean {
    return score < AT_RISK_SCORE_THRESHOLD && daysSinceLastActivity >= AT_RISK_INACTIVITY_DAYS
}
