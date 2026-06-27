import { describe, it, expect } from 'vitest'
import { nextDueDate, isRecurrence } from './task-recurrence'

describe('nextDueDate', () => {
    it('advances daily / weekly by fixed offsets, preserving time', () => {
        const base = new Date('2026-03-10T14:30:00Z')
        expect(nextDueDate(base, 'daily')!.toISOString()).toBe('2026-03-11T14:30:00.000Z')
        expect(nextDueDate(base, 'weekly')!.toISOString()).toBe('2026-03-17T14:30:00.000Z')
    })

    it('advances monthly by one calendar month', () => {
        const base = new Date(2026, 2, 10, 9, 0, 0) // 10 Mar 2026 local
        const next = nextDueDate(base, 'monthly')!
        expect(next.getMonth()).toBe(3) // April
        expect(next.getDate()).toBe(10)
    })

    it('clamps month-end overflow (Jan 31 → Feb 28)', () => {
        const jan31 = new Date(2026, 0, 31, 9, 0, 0)
        const next = nextDueDate(jan31, 'monthly')!
        expect(next.getMonth()).toBe(1) // February
        expect(next.getDate()).toBe(28) // 2026 is not a leap year
    })

    it('returns null for none / invalid', () => {
        expect(nextDueDate(new Date(), 'none')).toBeNull()
        expect(nextDueDate(new Date('invalid'), 'daily')).toBeNull()
    })

    it('isRecurrence validates the union', () => {
        expect(isRecurrence('weekly')).toBe(true)
        expect(isRecurrence('yearly')).toBe(false)
        expect(isRecurrence(5)).toBe(false)
    })
})
