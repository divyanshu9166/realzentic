import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
    classifyPresence,
    DEFAULT_ONLINE_WITHIN_SEC,
    DEFAULT_AWAY_WITHIN_SEC,
    type AgentPresence,
} from './geo'

describe('classifyPresence', () => {
    const now = 1_000_000_000_000 // fixed epoch ms

    it('classifies by recency with inclusive boundaries', () => {
        expect(classifyPresence(now, now)).toBe('online') // age 0
        expect(classifyPresence(now - 60_000, now, 60, 300)).toBe('online') // exactly online bound
        expect(classifyPresence(now - 61_000, now, 60, 300)).toBe('away')
        expect(classifyPresence(now - 300_000, now, 60, 300)).toBe('away') // exactly away bound
        expect(classifyPresence(now - 301_000, now, 60, 300)).toBe('offline')
    })

    it('treats null/undefined/non-finite last-seen as offline', () => {
        expect(classifyPresence(null, now)).toBe('offline')
        expect(classifyPresence(undefined, now)).toBe('offline')
        expect(classifyPresence(NaN, now)).toBe('offline')
    })

    it('treats future-dated pings (clock skew) as online', () => {
        expect(classifyPresence(now + 5_000, now)).toBe('online')
    })

    it('validates thresholds', () => {
        expect(() => classifyPresence(now, now, -1, 300)).toThrow()
        expect(() => classifyPresence(now, now, 300, 60)).toThrow() // online > away
        expect(() => classifyPresence(now, now, 60, Infinity)).toThrow()
    })

    it('property: result is always one of the three states and monotone in age', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 10_000 }), // age in seconds
                (ageSec) => {
                    const p = classifyPresence(now - ageSec * 1000, now)
                    expect(['online', 'away', 'offline']).toContain(p)
                    // Older-or-equal age can never be "more present" than younger age.
                    const rank: Record<AgentPresence, number> = { online: 0, away: 1, offline: 2 }
                    const older = classifyPresence(now - (ageSec + 1) * 1000, now)
                    expect(rank[older]).toBeGreaterThanOrEqual(rank[p])
                },
            ),
            { numRuns: 200 },
        )
    })

    it('uses sane defaults (60s online, 300s away)', () => {
        expect(DEFAULT_ONLINE_WITHIN_SEC).toBe(60)
        expect(DEFAULT_AWAY_WITHIN_SEC).toBe(300)
        expect(classifyPresence(now - 30_000, now)).toBe('online')
        expect(classifyPresence(now - 120_000, now)).toBe('away')
        expect(classifyPresence(now - 600_000, now)).toBe('offline')
    })
})
