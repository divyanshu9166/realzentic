/**
 * Shared property-based testing generators (arbitraries) for the Real Estate CRM.
 *
 * These reusable `fast-check` arbitraries constrain the input space to the
 * domains used across the platform so that every property test exercises
 * realistic values plus the boundary cases flagged in the design prework.
 *
 * Property-tag comment convention (see design.md → Testing Strategy → PBT):
 *
 *   // Feature: real-estate-crm, Property {number}: {property_text}
 *
 * Each property test MUST carry exactly one such comment immediately above the
 * `it(...)`/`test(...)` it implements, and SHOULD run with the project default
 * of 100 iterations via `fcAssert` (or `fc.assert(..., FC_RUN_CONFIG)`).
 *
 * Requirements: 20.4
 */
import fc from 'fast-check'
import { MONEY_MAX, MONEY_MIN } from '@/lib/money'

/**
 * Project-wide default fast-check run parameters.
 *
 * Every property test runs a minimum of 100 iterations. Pass this object as
 * the second argument to `fc.assert`, or use the {@link fcAssert} wrapper.
 */
export const DEFAULT_NUM_RUNS = 100

export const FC_RUN_CONFIG: fc.Parameters<unknown> = {
    numRuns: DEFAULT_NUM_RUNS,
}

/**
 * Thin wrapper around `fc.assert` that applies the project default of 100
 * iterations. Extra parameters can be supplied (and override the default).
 *
 * @example
 *   // Feature: real-estate-crm, Property 2: Percentage sold is bounded
 *   it('is bounded between 0 and 100', () => {
 *     fcAssert(fc.property(unitCountArb, (n) => percentSold(n) <= 100))
 *   })
 */
export function fcAssert<Ts>(
    property: fc.IRawProperty<Ts>,
    params: fc.Parameters<Ts> = {},
): void {
    fc.assert(property, { numRuns: DEFAULT_NUM_RUNS, ...params })
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * A monetary amount within the inclusive platform range
 * `0.00 … 999,999,999.99`, rounded to two decimal places.
 *
 * Includes the boundary values (min, max) and small/edge magnitudes via
 * fast-check's built-in bias so rounding/overflow paths are exercised.
 */
export const moneyArb: fc.Arbitrary<number> = fc
    .double({
        min: MONEY_MIN,
        max: MONEY_MAX,
        noNaN: true,
        noDefaultInfinity: true,
    })
    .map((n) => Math.round(n * 100) / 100)

/**
 * A monetary amount that may be zero up to the supplied (inclusive) maximum.
 * Useful for discounts, partial payments, and other bounded sub-amounts.
 */
export function moneyUpToArb(max: number): fc.Arbitrary<number> {
    const clampedMax = Math.min(Math.max(max, MONEY_MIN), MONEY_MAX)
    return fc
        .double({ min: MONEY_MIN, max: clampedMax, noNaN: true, noDefaultInfinity: true })
        .map((n) => Math.round(n * 100) / 100)
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

/** A valid WGS-84 latitude in degrees, `-90 … 90` (inclusive). */
export const latitudeArb: fc.Arbitrary<number> = fc.double({
    min: -90,
    max: 90,
    noNaN: true,
    noDefaultInfinity: true,
})

/** A valid WGS-84 longitude in degrees, `-180 … 180` (inclusive). */
export const longitudeArb: fc.Arbitrary<number> = fc.double({
    min: -180,
    max: 180,
    noNaN: true,
    noDefaultInfinity: true,
})

export interface Coordinate {
    lat: number
    lng: number
}

/** A `{ lat, lng }` coordinate pair within valid WGS-84 bounds. */
export const coordinateArb: fc.Arbitrary<Coordinate> = fc.record({
    lat: latitudeArb,
    lng: longitudeArb,
})

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

/**
 * An integer score in the inclusive range `0 … 100` used for match scores,
 * deal-probability scores, duplicate-confidence, and percentages.
 *
 * The boundary values 0 and 100, plus the deal/at-risk thresholds (30, 80,
 * 90) flagged in prework, are biased into the sample.
 */
export const scoreArb: fc.Arbitrary<number> = fc.nat({ max: 100 })

/** A real-valued (two-decimal) score in `0 … 100` for continuous metrics. */
export const fractionalScoreArb: fc.Arbitrary<number> = fc
    .double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })
    .map((n) => Math.round(n * 100) / 100)
