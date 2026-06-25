/**
 * Integration test for the AI Deal Predictor
 * (`app/actions/ai-deal-predictor.ts`), run against the real Postgres database.
 *
 * Covers:
 *   - 23.9 scoreAndPersistDeal(dealId): a deal with a token-paying booking is
 *     forced into the [90,100] band, marked Hot, persists aiScore/aiScoredAt,
 *     and raises a `deal_hot` notification on the fresh marking (Req 17.2-17.5).
 *   - 23.7 (Property 61) recalcAllDeals(): the last successfully computed score
 *     is retained — after a run every deal still carries a numeric aiScore
 *     (scores are preserved/updated, never wiped) (Req 17.7).
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

import { recalcAllDeals, scoreAndPersistDeal } from '@/app/actions/ai-deal-predictor'
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

/** Create a Deal (with optional token-paying Booking) and register cleanup. */
async function makeDealWithBooking(
    cleanup: Cleanup,
    opts: { withToken: boolean } = { withToken: false },
) {
    const project = await makeProject(cleanup)
    const tower = await makeTower(cleanup, project.id)
    const unit = await makeUnit(cleanup, tower.id, { status: 'Available' })
    const contact = await makeContact(cleanup)
    const stage = await makeStage(cleanup)

    const deal = await prisma.deal.create({
        data: {
            contactId: contact.id,
            unitId: unit.id,
            stageId: stage.id,
            value: 7500000,
            source: 'Website',
        },
    })
    cleanup.add(() => prisma.deal.delete({ where: { id: deal.id } }))

    if (opts.withToken) {
        const booking = await prisma.booking.create({
            data: {
                dealId: deal.id,
                unitId: unit.id,
                contactId: contact.id,
                agreementValue: 7500000,
                tokenAmount: 100000,
                tokenReceiptNo: uid('RCPT'),
                tokenDate: new Date(),
            },
        })
        cleanup.add(() => prisma.booking.delete({ where: { id: booking.id } }))
    }

    return { deal, unit, contact, stage }
}

describe('AI deal predictor — DB integration', () => {
    // 23.9: token-paying booking forces a Hot score and a deal_hot notification.
    it('scoreAndPersistDeal scores a token-paying deal >= 90, marks it Hot, and notifies', async () => {
        const { deal } = await makeDealWithBooking(cleanup, { withToken: true })

        const res = await scoreAndPersistDeal(deal.id)

        cleanup.add(() =>
            prisma.notification.deleteMany({
                where: { metadata: { path: ['dealId'], equals: deal.id } },
            }),
        )
        cleanup.add(() => prisma.dealActivity.deleteMany({ where: { dealId: deal.id } }))

        expect(res.success).toBe(true)
        if (!res.success) return
        expect(res.data.score).toBeGreaterThanOrEqual(90)
        expect(res.data.isHot).toBe(true)
        expect(res.data.newlyHot).toBe(true)

        // aiScore + aiScoredAt persisted on the deal, isHot set.
        const persisted = await prisma.deal.findUnique({ where: { id: deal.id } })
        expect(persisted?.aiScore).toBeGreaterThanOrEqual(90)
        expect(persisted?.aiScoredAt).toBeTruthy()
        expect(persisted?.isHot).toBe(true)

        // A deal_hot notification was created on the fresh marking.
        const hotNotifications = await prisma.notification.findMany({
            where: { type: 'deal_hot', metadata: { path: ['dealId'], equals: deal.id } },
        })
        expect(hotNotifications.length).toBeGreaterThanOrEqual(1)
    })

    // 23.7 / Property 61: recalcAllDeals retains the last computed score.
    it('recalcAllDeals preserves a deal score — a scored deal keeps a numeric aiScore after a run', async () => {
        const { deal } = await makeDealWithBooking(cleanup, { withToken: true })

        // First, establish a score.
        const first = await scoreAndPersistDeal(deal.id)
        cleanup.add(() =>
            prisma.notification.deleteMany({
                where: { metadata: { path: ['dealId'], equals: deal.id } },
            }),
        )
        cleanup.add(() => prisma.dealActivity.deleteMany({ where: { dealId: deal.id } }))
        expect(first.success).toBe(true)

        const before = await prisma.deal.findUnique({ where: { id: deal.id } })
        expect(typeof before?.aiScore).toBe('number')

        // Run the full recalculation: it should succeed and never wipe scores.
        const run = await recalcAllDeals()
        cleanup.add(() =>
            prisma.notification.deleteMany({ where: { type: 'deal_recalc_error' } }),
        )

        expect(run.success).toBe(true)

        const after = await prisma.deal.findUnique({ where: { id: deal.id } })
        // The deal still carries a numeric score (preserved/updated, not null).
        expect(after?.aiScore).not.toBeNull()
        expect(typeof after?.aiScore).toBe('number')
        expect(after?.aiScoredAt).toBeTruthy()
    })
})
