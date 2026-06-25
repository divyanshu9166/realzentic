/**
 * Integration tests for demand-letter dispatch (`app/actions/deals.ts`),
 * run against the real Postgres database with INJECTED mock transports.
 *
 * Covers task 13.7:
 *   - 13.7 success: injected transports resolve → letter records 'Sent'/'Sent'
 *   - 13.7 failure: injected transports always throw → after retries the letter
 *     records 'Failed' and a manager Notification (type 'financial_alert') is
 *     created (Req 9.3).
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

import { convertDealToBooking, createDeal, sendDemandLetter } from '@/app/actions/deals'
import {
    Cleanup,
    disconnect,
    makeContact,
    makeProject,
    makeStage,
    makeTower,
    makeUnit,
    prisma,
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
 * Build a booking with a single milestone and a Pending demand letter for it,
 * cleaning up the whole subtree afterwards.
 *
 * Uses the real fixture chain (project → tower → unit, contact, won stage,
 * createDeal, convertDealToBooking) and then creates the milestone +
 * demand-letter rows directly so the test owns exactly one milestone.
 */
async function makeDemandLetterFixture() {
    const project = await makeProject(cleanup)
    const tower = await makeTower(cleanup, project.id)
    const unit = await makeUnit(cleanup, tower.id, { status: 'Available' })
    const contact = await makeContact(cleanup)
    const stage = await makeStage(cleanup, { isWon: true })

    const dealRes = await createDeal({
        contactId: contact.id,
        stageId: stage.id,
        value: 5_000_000,
        unitId: unit.id,
    })
    expect(dealRes.success).toBe(true)
    const deal = (dealRes as { data: { id: number } }).data
    cleanup.add(() => prisma.deal.delete({ where: { id: deal.id } }))

    const bookingRes = await convertDealToBooking(deal.id, {
        agreementValue: 5_000_000,
        tokenAmount: 100_000,
        tokenReceiptNo: `TR-${deal.id}`,
        unitId: unit.id,
    })
    expect(bookingRes.success).toBe(true)
    const booking = (bookingRes as { data: { id: number } }).data

    const milestone = await prisma.bookingMilestone.create({
        data: {
            bookingId: booking.id,
            name: 'Foundation',
            dueDate: new Date(),
            amount: 1_000_000,
            paidAmount: 0,
            status: 'Upcoming',
        },
    })

    const letter = await prisma.demandLetter.create({
        data: { milestoneId: milestone.id, windowDays: 7 },
    })

    // Tear down the booking subtree before the fixture rows (unit/deal) are
    // removed: clear the unit→booking link, drop letters/milestones/activity,
    // then the booking itself.
    cleanup.add(async () => {
        await prisma.demandLetter.deleteMany({ where: { milestoneId: milestone.id } })
        await prisma.bookingMilestone.deleteMany({ where: { bookingId: booking.id } })
        await prisma.unit.update({ where: { id: unit.id }, data: { bookingId: null } })
        await prisma.dealActivity.deleteMany({ where: { dealId: deal.id } })
        await prisma.booking.deleteMany({ where: { id: booking.id } })
    })

    return { letter, milestone, booking, contact, unit, deal }
}

describe('Demand-letter dispatch — DB integration (task 13.7)', () => {
    // 13.7 success path (Req 9.2)
    it('sendDemandLetter records Sent/Sent when injected transports resolve', async () => {
        const { letter } = await makeDemandLetterFixture()

        const whatsappCalls: string[] = []
        const emailCalls: string[] = []
        const res = await sendDemandLetter(letter.id, {
            sendWhatsApp: async (phone, _text) => {
                whatsappCalls.push(phone)
            },
            sendEmail: async (to, _subject, _html) => {
                emailCalls.push(to)
            },
        })

        expect(res.success).toBe(true)
        if (res.success) {
            expect(res.data.whatsappStatus).toBe('Sent')
            expect(res.data.emailStatus).toBe('Sent')
        }
        // Both transports were actually invoked.
        expect(whatsappCalls.length).toBeGreaterThan(0)
        expect(emailCalls.length).toBeGreaterThan(0)

        const persisted = await prisma.demandLetter.findUnique({ where: { id: letter.id } })
        expect(persisted?.whatsappStatus).toBe('Sent')
        expect(persisted?.emailStatus).toBe('Sent')
        expect(persisted?.sentDate).toBeTruthy()
    })

    // 13.7 failure + manager notification (Req 9.3)
    it('records Failed and notifies a manager when injected transports always throw', async () => {
        const { letter } = await makeDemandLetterFixture()

        const since = new Date()
        cleanup.add(() =>
            prisma.notification.deleteMany({
                where: { type: 'financial_alert', createdAt: { gte: since } },
            }),
        )

        const res = await sendDemandLetter(letter.id, {
            sendWhatsApp: async () => {
                throw new Error('WhatsApp transport down')
            },
            sendEmail: async () => {
                throw new Error('Email transport down')
            },
        })

        // Send failures never throw into the caller; statuses are persisted.
        expect(res.success).toBe(true)
        if (res.success) {
            expect(res.data.whatsappStatus).toBe('Failed')
            expect(res.data.emailStatus).toBe('Failed')
        }

        const persisted = await prisma.demandLetter.findUnique({ where: { id: letter.id } })
        expect(persisted?.whatsappStatus).toBe('Failed')
        expect(persisted?.emailStatus).toBe('Failed')

        // A manager financial_alert notification was created (Req 9.3).
        const notifications = await prisma.notification.findMany({
            where: { type: 'financial_alert', createdAt: { gte: since } },
        })
        expect(notifications.length).toBeGreaterThan(0)
        expect(notifications.some((n) => /demand letter delivery failed/i.test(n.title))).toBe(true)
    })
})
