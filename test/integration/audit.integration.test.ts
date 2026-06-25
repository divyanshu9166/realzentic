/**
 * Integration tests for audit logging on status & financial actions, run
 * against the real Postgres database.
 *
 * Covers:
 *   - 27.1 Property 69: an audit entry is written on status and financial
 *     actions (Req 20.7):
 *       • moveDeal           → DealActivity (type STAGE_CHANGE)
 *       • revisePrice        → UnitPriceHistory
 *       • convertDealToBooking → DealActivity (type BOOKING_CREATED)
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

import { convertDealToBooking, createDeal, moveDeal } from '@/app/actions/deals'
import { revisePrice } from '@/app/actions/properties'
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

describe('Audit logging — DB integration (Property 69, Req 20.7)', () => {
    // moveDeal writes a STAGE_CHANGE DealActivity audit row.
    it('moveDeal writes a STAGE_CHANGE DealActivity for the deal', async () => {
        const contact = await makeContact(cleanup)
        const fromStage = await makeStage(cleanup)
        const toStage = await makeStage(cleanup)

        const dealRes = await createDeal({
            contactId: contact.id,
            stageId: fromStage.id,
            value: 4_000_000,
        })
        expect(dealRes.success).toBe(true)
        const dealId = (dealRes.data as { id: number }).id
        cleanup.add(async () => {
            await prisma.dealActivity.deleteMany({ where: { dealId } })
            await prisma.deal.deleteMany({ where: { id: dealId } })
        })

        const moved = await moveDeal(dealId, toStage.id)
        expect(moved.success).toBe(true)

        const activities = await prisma.dealActivity.findMany({
            where: { dealId, type: 'STAGE_CHANGE' },
        })
        expect(activities.length).toBeGreaterThanOrEqual(1)
        expect(activities[0].newStageId).toBe(toStage.id)
        expect(activities[0].oldStageId).toBe(fromStage.id)
    })

    // revisePrice writes a UnitPriceHistory audit row.
    it('revisePrice writes a UnitPriceHistory row', async () => {
        const project = await makeProject(cleanup)
        const tower = await makeTower(cleanup, project.id)
        const unit = await makeUnit(cleanup, tower.id, { totalPrice: 6_000_000 })
        cleanup.add(() => prisma.unitPriceHistory.deleteMany({ where: { unitId: unit.id } }))

        const res = await revisePrice(unit.id, 6_600_000, 'Quarterly market revision')
        expect(res.success).toBe(true)

        const history = await prisma.unitPriceHistory.findMany({ where: { unitId: unit.id } })
        expect(history).toHaveLength(1)
        expect(Number(history[0].oldPrice)).toBe(6_000_000)
        expect(Number(history[0].newPrice)).toBe(6_600_000)
        expect(history[0].reason).toBe('Quarterly market revision')
    })

    // convertDealToBooking writes a BOOKING_CREATED DealActivity audit row.
    it('convertDealToBooking writes a BOOKING_CREATED DealActivity', async () => {
        const contact = await makeContact(cleanup)
        const stage = await makeStage(cleanup, { isWon: true })
        const project = await makeProject(cleanup)
        const tower = await makeTower(cleanup, project.id)
        const unit = await makeUnit(cleanup, tower.id, { status: 'Available' })

        const dealRes = await createDeal({
            contactId: contact.id,
            stageId: stage.id,
            value: 5_000_000,
            unitId: unit.id,
        })
        expect(dealRes.success).toBe(true)
        const dealId = (dealRes.data as { id: number }).id
        // Clean up deal + booking + audit rows before fixtures (LIFO order).
        cleanup.add(async () => {
            await prisma.bookingMilestone.deleteMany({ where: { booking: { dealId } } })
            await prisma.dealActivity.deleteMany({ where: { dealId } })
            await prisma.booking.deleteMany({ where: { dealId } })
            await prisma.deal.deleteMany({ where: { id: dealId } })
        })

        const conv = await convertDealToBooking(dealId, {
            agreementValue: 5_000_000,
            tokenAmount: 100_000,
            tokenReceiptNo: uid('RCPT'),
        })
        expect(conv.success).toBe(true)

        const activities = await prisma.dealActivity.findMany({
            where: { dealId, type: 'BOOKING_CREATED' },
        })
        expect(activities.length).toBeGreaterThanOrEqual(1)
    })
})
