/**
 * Unit tests for the Demand Letter & Payment Automation pure helpers
 * (`lib/demand.ts`, Task 13.1).
 *
 * These are example-based unit tests covering core behaviour and edge cases.
 * The numbered design Properties (36, 37) are implemented separately as
 * property-based tests in their own tasks (13.2, 13.3).
 */
import { describe, expect, it } from 'vitest'
import { aggregateOverdueCollections, shouldGenerateDemand } from './demand'
import type { MilestoneLike } from './deals'

const day = 24 * 60 * 60 * 1000
const now = new Date('2024-01-15T00:00:00.000Z')

function milestone(overrides: Partial<MilestoneLike> = {}): MilestoneLike {
    return {
        amount: 100_000,
        paidAmount: 0,
        dueDate: new Date(now.getTime() + 5 * day),
        ...overrides,
    }
}

describe('shouldGenerateDemand', () => {
    it('generates when unpaid and due date falls within the window', () => {
        expect(shouldGenerateDemand(milestone(), now, 7, [])).toBe(true)
    })

    it('does not generate when the milestone is fully paid', () => {
        const m = milestone({ amount: 100_000, paidAmount: 100_000 })
        expect(shouldGenerateDemand(m, now, 7, [])).toBe(false)
    })

    it('generates for a partially paid (still unpaid) milestone', () => {
        const m = milestone({ amount: 100_000, paidAmount: 40_000 })
        expect(shouldGenerateDemand(m, now, 7, [])).toBe(true)
    })

    it('does not generate when the due date is beyond the window', () => {
        const m = milestone({ dueDate: new Date(now.getTime() + 10 * day) })
        expect(shouldGenerateDemand(m, now, 7, [])).toBe(false)
    })

    it('does not generate when the due date is before now', () => {
        const m = milestone({ dueDate: new Date(now.getTime() - day) })
        expect(shouldGenerateDemand(m, now, 7, [])).toBe(false)
    })

    it('includes the window boundaries (now and now + windowDays)', () => {
        const atStart = milestone({ dueDate: new Date(now.getTime()) })
        const atEnd = milestone({ dueDate: new Date(now.getTime() + 7 * day) })
        expect(shouldGenerateDemand(atStart, now, 7, [])).toBe(true)
        expect(shouldGenerateDemand(atEnd, now, 7, [])).toBe(true)
    })

    it('de-duplicates when a letter already exists for the same window', () => {
        expect(shouldGenerateDemand(milestone(), now, 7, [{ windowDays: 7 }])).toBe(false)
    })

    it('still generates when an existing letter is for a different window', () => {
        expect(shouldGenerateDemand(milestone(), now, 7, [{ windowDays: 15 }])).toBe(true)
    })

    it('rejects a non-positive window', () => {
        expect(shouldGenerateDemand(milestone({ dueDate: now }), now, 0, [])).toBe(false)
    })
})

describe('aggregateOverdueCollections', () => {
    it('counts overdue milestones and sums their unpaid amounts (derived status)', () => {
        const milestones: MilestoneLike[] = [
            // Overdue, fully unpaid -> contributes 100000
            milestone({ amount: 100_000, paidAmount: 0, dueDate: new Date(now.getTime() - day) }),
            // Overdue, partially paid -> contributes 60000
            milestone({ amount: 100_000, paidAmount: 40_000, dueDate: new Date(now.getTime() - day) }),
            // Upcoming (future due) -> ignored
            milestone({ amount: 50_000, paidAmount: 0, dueDate: new Date(now.getTime() + 3 * day) }),
            // Paid -> ignored
            milestone({ amount: 50_000, paidAmount: 50_000, dueDate: new Date(now.getTime() - day) }),
        ]
        const result = aggregateOverdueCollections(milestones, now)
        expect(result.count).toBe(2)
        expect(result.sumUnpaid).toBe(160_000)
    })

    it('returns zeros for an empty set', () => {
        expect(aggregateOverdueCollections([], now)).toEqual({ count: 0, sumUnpaid: 0 })
    })

    it('uses the persisted status when now is not provided', () => {
        const milestones: MilestoneLike[] = [
            { amount: 100_000, paidAmount: 25_000, dueDate: now, status: 'Overdue' },
            { amount: 100_000, paidAmount: 0, dueDate: now, status: 'Upcoming' },
        ]
        const result = aggregateOverdueCollections(milestones)
        expect(result.count).toBe(1)
        expect(result.sumUnpaid).toBe(75_000)
    })

    it('rounds the unpaid sum to two decimals', () => {
        const milestones: MilestoneLike[] = [
            { amount: 100.005, paidAmount: 0, dueDate: now, status: 'Overdue' },
            { amount: 0.005, paidAmount: 0, dueDate: now, status: 'Overdue' },
        ]
        const result = aggregateOverdueCollections(milestones)
        expect(result.count).toBe(2)
        expect(result.sumUnpaid).toBe(100.02)
    })
})
