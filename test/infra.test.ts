/**
 * Infrastructure smoke test for the property-based testing setup (Task 1.3).
 *
 * This is NOT one of the 69 numbered design properties — it only verifies that
 * `vitest` + `fast-check` are wired up, the shared generators produce in-range
 * values, and the 100-iteration default is applied. The numbered Properties
 * (1–69) are implemented in their own colocated `*.test.ts` files using the
 * tag convention documented in `test/generators.ts`.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { MONEY_MAX, MONEY_MIN, isMoneyInRange } from '@/lib/money'
import {
    DEFAULT_NUM_RUNS,
    coordinateArb,
    fcAssert,
    moneyArb,
    scoreArb,
} from './generators'

describe('PBT infrastructure', () => {
    it('runs a trivial property with the 100-iteration default', () => {
        let runs = 0
        fcAssert(
            fc.property(fc.integer(), (n) => {
                runs += 1
                return n === n
            }),
        )
        expect(runs).toBe(DEFAULT_NUM_RUNS)
    })

    it('moneyArb only produces values within the platform money range', () => {
        fcAssert(
            fc.property(moneyArb, (amount) => {
                expect(amount).toBeGreaterThanOrEqual(MONEY_MIN)
                expect(amount).toBeLessThanOrEqual(MONEY_MAX)
                expect(isMoneyInRange(amount)).toBe(true)
                // Two-decimal precision (tolerant of IEEE-754 representation).
                expect(Math.abs(amount * 100 - Math.round(amount * 100))).toBeLessThan(1e-6)
            }),
        )
    })

    it('coordinateArb produces valid WGS-84 coordinates', () => {
        fcAssert(
            fc.property(coordinateArb, ({ lat, lng }) => {
                expect(lat).toBeGreaterThanOrEqual(-90)
                expect(lat).toBeLessThanOrEqual(90)
                expect(lng).toBeGreaterThanOrEqual(-180)
                expect(lng).toBeLessThanOrEqual(180)
            }),
        )
    })

    it('scoreArb produces integers within 0..100', () => {
        fcAssert(
            fc.property(scoreArb, (score) => {
                expect(Number.isInteger(score)).toBe(true)
                expect(score).toBeGreaterThanOrEqual(0)
                expect(score).toBeLessThanOrEqual(100)
            }),
        )
    })
})
