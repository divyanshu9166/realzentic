/**
 * Property-based tests for the Site Visit 2.0 geo/OTP/analytics pure helpers
 * ({@link generateOtp}, {@link verifyOtp}, {@link withinGeofence},
 * {@link haversineMeters}, {@link computeVisitAnalytics} in `lib/geo.ts`).
 *
 * Implements design Correctness Properties 45–47:
 *   - Property 45: OTP check-in verification (Req 12.3)
 *   - Property 46: Geofence check-in threshold (Req 12.4)
 *   - Property 47: Visit analytics aggregation (Req 12.6)
 *
 * Tag convention (design.md → Testing Strategy → PBT):
 *   // Feature: real-estate-crm, Property N: <text>
 *
 * Runs at the project default of 100 iterations via `fcAssert`.
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
    generateOtp,
    verifyOtp,
    withinGeofence,
    haversineMeters,
    computeVisitAnalytics,
    DEFAULT_GEOFENCE_RADIUS_M,
    type VisitRecord,
} from '@/lib/geo'
import { fcAssert, latitudeArb, longitudeArb } from '@/test/generators'

/** An OTP length in the realistic range `1 … 8` digits (biased to 6). */
const otpLengthArb: fc.Arbitrary<number> = fc.oneof(
    { weight: 3, arbitrary: fc.constant(6) },
    { weight: 1, arbitrary: fc.integer({ min: 1, max: 8 }) },
)

/**
 * A deterministic `random()` function (returning values in `[0, 1)`) backed by
 * a fixed pool of draws, so OTP generation is reproducible inside a property.
 * The pool is sized so generation never runs dry for the lengths under test.
 */
const randomFnArb: fc.Arbitrary<() => number> = fc
    .array(
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true, maxExcluded: true }),
        { minLength: 8, maxLength: 8 },
    )
    .map((draws) => {
        let i = 0
        return () => draws[i++ % draws.length]
    })

/** A visit duration in minutes, rounded to two decimals, `0 … 600`. */
const durationArb: fc.Arbitrary<number> = fc
    .double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true })
    .map((n) => Math.round(n * 100) / 100)

/** A buyer rating 1–5 (integer). */
const ratingArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 5 })

/**
 * A single visit record. Both fields are independently present-or-absent
 * (null / undefined) so the "no rated visits" and "no timed visits" branches
 * are exercised alongside fully-populated visits.
 */
const visitArb: fc.Arbitrary<VisitRecord> = fc.record({
    buyerRating: fc.oneof(ratingArb, fc.constant(null), fc.constant(undefined)),
    visitDurationMin: fc.oneof(durationArb, fc.constant(null), fc.constant(undefined)),
})

const visitsArb: fc.Arbitrary<VisitRecord[]> = fc.array(visitArb, { maxLength: 30 })

describe('geo / OTP / visit-analytics pure helpers', () => {
    // Feature: real-estate-crm, Property 45: OTP check-in verification
    // For any generated OTP and entered OTP, the site-visit check-in is
    // accepted if and only if the entered OTP equals the generated OTP.
    // Validates: Requirements 12.3
    it('Property 45: check-in is accepted iff entered OTP equals generated OTP', () => {
        fcAssert(
            fc.property(randomFnArb, otpLengthArb, fc.string(), (random, length, entered) => {
                const generated = generateOtp(random, length)
                // Generation invariants: exactly `length` numeric digits.
                expect(generated).toHaveLength(length)
                expect(generated).toMatch(/^[0-9]+$/)

                // Accept iff equal. The correct OTP always verifies; an
                // arbitrary entered string verifies exactly when it matches.
                expect(verifyOtp(generated, generated)).toBe(true)
                expect(verifyOtp(generated, entered)).toBe(generated === entered)
            }),
        )
    })

    // Feature: real-estate-crm, Property 46: Geofence check-in threshold
    // For any agent coordinates and project coordinates, the geo check-in is
    // rejected if and only if the haversine distance between them exceeds
    // 500 meters.
    // Validates: Requirements 12.4
    it('Property 46: check-in is rejected iff haversine distance exceeds 500m', () => {
        fcAssert(
            fc.property(
                latitudeArb,
                longitudeArb,
                latitudeArb,
                longitudeArb,
                (agentLat, agentLng, projLat, projLng) => {
                    const distance = haversineMeters(agentLat, agentLng, projLat, projLng)
                    const accepted = withinGeofence(agentLat, agentLng, projLat, projLng)

                    // Accepted iff within the default 500m radius; equivalently
                    // rejected iff the distance exceeds the threshold.
                    expect(accepted).toBe(distance <= DEFAULT_GEOFENCE_RADIUS_M)
                    expect(!accepted).toBe(distance > DEFAULT_GEOFENCE_RADIUS_M)
                },
            ),
        )
    })

    // Feature: real-estate-crm, Property 47: Visit analytics aggregation
    // For any set of completed visits, visit analytics return the visit count,
    // the average buyer rating over rated visits, and the average visit
    // duration over timed visits, matching direct computation.
    // Validates: Requirements 12.6
    it('Property 47: analytics match direct count / average computation', () => {
        fcAssert(
            fc.property(visitsArb, (visits) => {
                const ratings = visits
                    .map((v) => v.buyerRating)
                    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r))
                const durations = visits
                    .map((v) => v.visitDurationMin)
                    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d))

                const expectedRating =
                    ratings.length === 0
                        ? null
                        : ratings.reduce((s, v) => s + v, 0) / ratings.length
                const expectedDuration =
                    durations.length === 0
                        ? null
                        : durations.reduce((s, v) => s + v, 0) / durations.length

                const result = computeVisitAnalytics(visits)

                expect(result.visitCount).toBe(visits.length)
                expect(result.averageRating).toBe(expectedRating)
                expect(result.averageDuration).toBe(expectedDuration)
            }),
        )
    })
})
