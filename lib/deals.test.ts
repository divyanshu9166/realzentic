/**
 * Unit tests for the Deal & Booking pure helpers (`lib/deals.ts`, Task 6.1).
 *
 * These are example-based unit tests covering core behaviour and edge cases.
 * The numbered design Properties (17–24) are implemented separately as
 * property-based tests in their own tasks.
 */
import { describe, expect, it } from 'vitest'
import {
    aggregateDealAnalytics,
    applyMilestonePayment,
    milestonesFromPlan,
    milestoneStatus,
    validateStageMove,
    type DealLike,
} from './deals'

describe('validateStageMove', () => {
    it('rejects a move to a non-existent stage', () => {
        const result = validateStageMove({ stageId: 1, value: 100 }, null)
        expect(result.ok).toBe(false)
        expect(result.error).toMatch(/does not exist/i)
    })

    it('accepts a move to an existing non-lost stage', () => {
        const result = validateStageMove({ stageId: 1, value: 100 }, { id: 2, isLost: false })
        expect(result.ok).toBe(true)
    })

    it('rejects a move to a lost stage without a lost reason', () => {
        const result = validateStageMove({ stageId: 1, value: 100 }, { id: 9, isLost: true })
        expect(result.ok).toBe(false)
        expect(result.error).toMatch(/lost reason/i)
    })

    it('accepts a move to a lost stage with a provided lost reason', () => {
        const result = validateStageMove(
            { stageId: 1, value: 100 },
            { id: 9, isLost: true },
            'Budget mismatch',
        )
        expect(result.ok).toBe(true)
    })

    it('treats a whitespace-only lost reason as missing', () => {
        const result = validateStageMove(
            { stageId: 1, value: 100 },
            { id: 9, isLost: true },
            '   ',
        )
        expect(result.ok).toBe(false)
    })

    it('uses a lost reason already on the deal when none is supplied', () => {
        const result = validateStageMove(
            { stageId: 1, value: 100, lostReason: 'Chose competitor' },
            { id: 9, isLost: true },
        )
        expect(result.ok).toBe(true)
    })
})

describe('milestonesFromPlan', () => {
    const base = new Date('2024-01-01T00:00:00.000Z')

    it('returns an empty list for an empty plan', () => {
        expect(milestonesFromPlan({ milestones: [] }, 1000, base)).toEqual([])
    })

    it('distributes amounts that sum exactly to the agreement value', () => {
        const plan = {
            milestones: [
                { name: 'Booking', dueOffsetDays: 0, percentage: 10 },
                { name: 'Agreement', dueOffsetDays: 30, percentage: 30 },
                { name: 'Possession', dueOffsetDays: 90, percentage: 60 },
            ],
        }
        const milestones = milestonesFromPlan(plan, 1_000_000, base)
        const sum = milestones.reduce((acc, m) => acc + m.amount, 0)
        expect(sum).toBe(1_000_000)
        expect(milestones).toHaveLength(3)
    })

    it('absorbs rounding remainder in the final milestone', () => {
        // 3 equal thirds of 100 cannot divide evenly at 2 dp.
        const plan = {
            milestones: [
                { name: 'A', dueOffsetDays: 0, percentage: 33.3333 },
                { name: 'B', dueOffsetDays: 0, percentage: 33.3333 },
                { name: 'C', dueOffsetDays: 0, percentage: 33.3334 },
            ],
        }
        const milestones = milestonesFromPlan(plan, 100, base)
        const sum = milestones.reduce((acc, m) => acc + m.amount, 0)
        expect(sum).toBe(100)
    })

    it('derives due dates from the base date and offset', () => {
        const plan = { milestones: [{ name: 'A', dueOffsetDays: 30, percentage: 100 }] }
        const [m] = milestonesFromPlan(plan, 500, base)
        expect(m.dueDate.toISOString()).toBe(new Date('2024-01-31T00:00:00.000Z').toISOString())
        expect(m.paidAmount).toBe(0)
    })
})

describe('milestoneStatus', () => {
    const now = new Date('2024-06-01T00:00:00.000Z')
    const future = new Date('2024-07-01T00:00:00.000Z')
    const past = new Date('2024-05-01T00:00:00.000Z')

    it('reports Paid when fully paid regardless of due date', () => {
        expect(milestoneStatus({ amount: 100, paidAmount: 100, dueDate: past }, now)).toBe('Paid')
    })

    it('reports Overdue when unpaid and past due', () => {
        expect(milestoneStatus({ amount: 100, paidAmount: 0, dueDate: past }, now)).toBe('Overdue')
    })

    it('reports Overdue when partially paid and past due', () => {
        expect(milestoneStatus({ amount: 100, paidAmount: 40, dueDate: past }, now)).toBe('Overdue')
    })

    it('reports Partially_Paid when partially paid and not yet due', () => {
        expect(milestoneStatus({ amount: 100, paidAmount: 40, dueDate: future }, now)).toBe(
            'Partially_Paid',
        )
    })

    it('reports Upcoming when unpaid and not yet due', () => {
        expect(milestoneStatus({ amount: 100, paidAmount: 0, dueDate: future }, now)).toBe('Upcoming')
    })
})

describe('applyMilestonePayment', () => {
    const milestone = { amount: 100, paidAmount: 0, dueDate: new Date('2024-06-01T00:00:00.000Z') }

    it('rejects a zero payment', () => {
        expect(applyMilestonePayment(milestone, 0).ok).toBe(false)
    })

    it('rejects a negative payment', () => {
        expect(applyMilestonePayment(milestone, -10).ok).toBe(false)
    })

    it('rejects a payment exceeding the outstanding amount', () => {
        expect(applyMilestonePayment(milestone, 150).ok).toBe(false)
    })

    it('rejects a non-finite payment', () => {
        expect(applyMilestonePayment(milestone, Number.NaN).ok).toBe(false)
    })

    it('marks a partial payment as Partially_Paid', () => {
        const result = applyMilestonePayment(milestone, 40)
        expect(result.ok).toBe(true)
        expect(result.milestone?.paidAmount).toBe(40)
        expect(result.milestone?.status).toBe('Partially_Paid')
    })

    it('marks a full payment as Paid', () => {
        const result = applyMilestonePayment(milestone, 100)
        expect(result.ok).toBe(true)
        expect(result.milestone?.status).toBe('Paid')
    })

    it('accumulates onto an existing paid amount and pays off', () => {
        const partial = { amount: 100, paidAmount: 60, dueDate: new Date() }
        const result = applyMilestonePayment(partial, 40)
        expect(result.ok).toBe(true)
        expect(result.milestone?.paidAmount).toBe(100)
        expect(result.milestone?.status).toBe('Paid')
    })
})

describe('aggregateDealAnalytics', () => {
    it('returns an empty array for no deals', () => {
        expect(aggregateDealAnalytics([])).toEqual([])
    })

    it('groups count and value sum by stage, sorted by stageId', () => {
        const deals: DealLike[] = [
            { stageId: 2, value: 100 },
            { stageId: 1, value: 50 },
            { stageId: 2, value: 25.5 },
            { stageId: 1, value: 50 },
        ]
        expect(aggregateDealAnalytics(deals)).toEqual([
            { stageId: 1, count: 2, totalValue: 100 },
            { stageId: 2, count: 2, totalValue: 125.5 },
        ])
    })
})
