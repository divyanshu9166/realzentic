/**
 * Integration tests for the Booking engine (`app/actions/deals.ts`), run
 * against the real Postgres database.
 *
 * Covers the DB-backed booking tasks that the pure-helper property tests
 * cannot exercise:
 *   - 7.3  Property 21: booking conversion requires an Available or Blocked
 *                       unit; a Sold/Booked unit is rejected and nothing
 *                       changes (Req 5.2, 5.3).
 *   - 7.4  Property 22: booking cancellation restores the unit to Available
 *                       (Req 5.7).
 *   - 7.5  Integration: two concurrent conversions on the SAME unit serialize
 *                       so exactly one succeeds (Req 5.4, 20.5).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: () => { }, revalidateTag: () => { } }))
vi.mock('@/lib/auth-helpers', async () => {
    const s = await import('./_session')
    return {
        getSession: async () => s.getTestSession(),
        requireAuth: async () => {
            const sess = s.getTestSession()
            if (!sess) throw new Error('Unauthorized')
            return sess
        },
        requireRole: async (...roles: string[]) => {
            const sess = s.getTestSession()
            if (!sess) throw new Error('Unauthorized')
            if (!roles.includes(sess.user.role)) throw new Error('Forbidden')
            return sess
        },
    }
})

import { cancelBooking, convertDealToBooking, createDeal } from '@/app/actions/deals'
import {
    Cleanup,
    disconnect,
    makeContact,
    makeProject,
    makeStage,
    makeTower,
    makeUnit,
    prisma,
    uid,
} from './harness'

let cleanup: Cleanup
beforeEach(() => {
    cleanup = new Cleanup()
})
afterEach(async () => {
    await cleanup.run()
})
afterAll(async () => {
    await disconnect()
})

/**
 * Create a Deal pointing at `unitId` and register cleanup for the rows the
 * booking engine may create against it (booking → cascades milestones; deal →
 * cascades dealActivities). The thunk is registered after `makeUnit`, so it
 * runs before the unit/tower/project cleanups (LIFO), satisfying the
 * Booking→Unit and Deal→Unit foreign keys.
 */
async function makeDealForUnit(
    contactId: number,
    stageId: number,
    unitId: number,
    value = 5_000_000,
) {
    const res = await createDeal({ contactId, stageId, value, unitId })
    if (!res.success) throw new Error(`createDeal failed: ${res.error}`)
    const deal = res.data!
    cleanup.add(async () => {
        // Booking → Deal/Unit are Restrict FKs, so remove bookings first
        // (cascades BookingMilestone), then the deal (cascades DealActivity).
        await prisma.booking.deleteMany({ where: { dealId: deal.id } })
        await prisma.deal.delete({ where: { id: deal.id } }).catch(() => undefined)
    })
    return deal
}

const validBooking = () => ({
    agreementValue: 5_000_000,
    tokenAmount: 100_000,
    tokenReceiptNo: uid('RCPT'),
})

describe('Booking engine — DB integration', () => {
    // ── 7.3 / Property 21: conversion requires Available or Blocked unit ──────
    // Validates: Requirements 5.2, 5.3
    it('convertDealToBooking succeeds on an Available unit and transitions it to Booked', async () => {
        const project = await makeProject(cleanup)
        const tower = await makeTower(cleanup, project.id)
        const unit = await makeUnit(cleanup, tower.id, { status: 'Available' })
        const contact = await makeContact(cleanup)
        const stage = await makeStage(cleanup, { isWon: true })
        const deal = await makeDealForUnit(contact.id, stage.id, unit.id)

        const res = await convertDealToBooking(deal.id, validBooking())
        expect(res.success).toBe(true)

        const row = await prisma.unit.findUnique({ where: { id: unit.id } })
        expect(row?.status).toBe('Booked')
        expect(row?.bookingId).toBe(res.data!.id)
    })

    it('convertDealToBooking succeeds on a Blocked unit', async () => {
        const project = await makeProject(cleanup)
        const tower = await makeTower(cleanup, project.id)
        const unit = await makeUnit(cleanup, tower.id, { status: 'Blocked' })
        const contact = await makeContact(cleanup)
        const stage = await makeStage(cleanup, { isWon: true })
        const deal = await makeDealForUnit(contact.id, stage.id, unit.id)

        const res = await convertDealToBooking(deal.id, validBooking())
        expect(res.success).toBe(true)

        const row = await prisma.unit.findUnique({ where: { id: unit.id } })
        expect(row?.status).toBe('Booked')
    })

    it.each(['Sold', 'Booked'] as const)(
        'convertDealToBooking against a %s unit fails and changes nothing',
        async (status) => {
            const project = await makeProject(cleanup)
            const tower = await makeTower(cleanup, project.id)
            const unit = await makeUnit(cleanup, tower.id, { status })
            const contact = await makeContact(cleanup)
            const stage = await makeStage(cleanup, { isWon: true })
            const deal = await makeDealForUnit(contact.id, stage.id, unit.id)

            const res = await convertDealToBooking(deal.id, validBooking())
            expect(res.success).toBe(false)

            // Nothing changed: the unit keeps its status and no booking exists.
            const row = await prisma.unit.findUnique({ where: { id: unit.id } })
            expect(row?.status).toBe(status)
            const bookingCount = await prisma.booking.count({ where: { dealId: deal.id } })
            expect(bookingCount).toBe(0)
            const activityCount = await prisma.dealActivity.count({
                where: { dealId: deal.id, type: 'BOOKING_CREATED' },
            })
            expect(activityCount).toBe(0)
        },
    )

    // ── 7.4 / Property 22: cancellation restores the unit to Available ────────
    // Validates: Requirements 5.7
    it('cancelBooking restores the unit to Available', async () => {
        const project = await makeProject(cleanup)
        const tower = await makeTower(cleanup, project.id)
        const unit = await makeUnit(cleanup, tower.id, { status: 'Available' })
        const contact = await makeContact(cleanup)
        const stage = await makeStage(cleanup, { isWon: true })
        const deal = await makeDealForUnit(contact.id, stage.id, unit.id)

        const converted = await convertDealToBooking(deal.id, validBooking())
        expect(converted.success).toBe(true)
        const bookingId = converted.data!.id

        // Unit is Booked before cancellation.
        const booked = await prisma.unit.findUnique({ where: { id: unit.id } })
        expect(booked?.status).toBe('Booked')

        const res = await cancelBooking(bookingId, 'Buyer withdrew')
        expect(res.success).toBe(true)

        const row = await prisma.unit.findUnique({ where: { id: unit.id } })
        expect(row?.status).toBe('Available')
        expect(row?.bookingId).toBeNull()

        const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
        expect(booking?.status).toBe('Cancelled')
    })

    // ── 7.5 Integration: concurrent conversions on the SAME unit serialize ────
    // Requirements: 5.4
    it('two concurrent conversions on the same unit: exactly one succeeds', async () => {
        const project = await makeProject(cleanup)
        const tower = await makeTower(cleanup, project.id)
        const unit = await makeUnit(cleanup, tower.id, { status: 'Available' })
        const contact = await makeContact(cleanup)
        const stage = await makeStage(cleanup, { isWon: true })

        // Two distinct deals, both pointing at the one unit.
        const dealA = await makeDealForUnit(contact.id, stage.id, unit.id)
        const dealB = await makeDealForUnit(contact.id, stage.id, unit.id)

        const [a, b] = await Promise.all([
            convertDealToBooking(dealA.id, validBooking()),
            convertDealToBooking(dealB.id, validBooking()),
        ])

        const successes = [a, b].filter((r) => r.success).length
        expect(successes).toBe(1)

        // The unit ends Booked exactly once: a single live booking references it.
        const row = await prisma.unit.findUnique({ where: { id: unit.id } })
        expect(row?.status).toBe('Booked')
        const bookingCount = await prisma.booking.count({ where: { unitId: unit.id } })
        expect(bookingCount).toBe(1)
    })
})
