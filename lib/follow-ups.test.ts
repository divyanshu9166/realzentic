import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { classifyFollowUpDue, daysUntilFollowUp, startOfUtcDay } from './follow-ups'

const DAY = 86_400_000
// A fixed "now": 2026-06-27T10:00:00Z (mid-day so time-of-day can't shift the day).
const NOW = Date.UTC(2026, 5, 27, 10, 0, 0)

describe('startOfUtcDay', () => {
    it('floors to UTC midnight', () => {
        expect(startOfUtcDay(NOW)).toBe(Date.UTC(2026, 5, 27, 0, 0, 0))
        expect(startOfUtcDay(Date.UTC(2026, 5, 27, 23, 59, 59))).toBe(Date.UTC(2026, 5, 27))
    })
})

describe('classifyFollowUpDue', () => {
    it('classifies overdue / today / upcoming by calendar day', () => {
        expect(classifyFollowUpDue(Date.UTC(2026, 5, 26, 23, 0), NOW)).toBe('overdue')
        expect(classifyFollowUpDue(Date.UTC(2026, 5, 27, 0, 1), NOW)).toBe('today')
        expect(classifyFollowUpDue(Date.UTC(2026, 5, 27, 23, 59), NOW)).toBe('today')
        expect(classifyFollowUpDue(Date.UTC(2026, 5, 28, 1, 0), NOW)).toBe('upcoming')
    })

    it('a same-instant follow-up is today', () => {
        expect(classifyFollowUpDue(NOW, NOW)).toBe('today')
    })

    it('throws on non-finite input', () => {
        expect(() => classifyFollowUpDue(NaN, NOW)).toThrow()
        expect(() => classifyFollowUpDue(NOW, Infinity)).toThrow()
    })

    it('property: classification is consistent with day offset sign', () => {
        fc.assert(
            fc.property(fc.integer({ min: -1000, max: 1000 }), (dayOffset) => {
                const follow = startOfUtcDay(NOW) + dayOffset * DAY + 5 * 3_600_000 // +5h within the day
                const bucket = classifyFollowUpDue(follow, NOW)
                if (dayOffset < 0) expect(bucket).toBe('overdue')
                else if (dayOffset === 0) expect(bucket).toBe('today')
                else expect(bucket).toBe('upcoming')
            }),
            { numRuns: 300 },
        )
    })
})

describe('daysUntilFollowUp', () => {
    it('is negative for past, 0 for today, positive for future', () => {
        expect(daysUntilFollowUp(Date.UTC(2026, 5, 24), NOW)).toBe(-3)
        expect(daysUntilFollowUp(Date.UTC(2026, 5, 27, 23, 0), NOW)).toBe(0)
        expect(daysUntilFollowUp(Date.UTC(2026, 6, 27), NOW)).toBe(30)
    })

    it('property: sign matches the bucket', () => {
        fc.assert(
            fc.property(fc.integer({ min: -500, max: 500 }), (dayOffset) => {
                const follow = startOfUtcDay(NOW) + dayOffset * DAY
                const days = daysUntilFollowUp(follow, NOW)
                expect(days).toBe(dayOffset)
            }),
            { numRuns: 200 },
        )
    })
})
