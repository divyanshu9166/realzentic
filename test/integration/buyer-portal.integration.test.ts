/**
 * Integration tests for the buyer self-service portal data actions
 * (`app/actions/buyer-portal.ts`), run against the real Postgres database.
 *
 * Covers the DB-backed property task:
 *   - 25.7 Property 64: buyer data isolation — every authenticated read/write
 *     is scoped to the session `contactId`, so one buyer can never see or
 *     mutate another buyer's data (Req 18.5, 18.6, 21.2).
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
vi.mock('@/lib/buyer-session', async () => {
    const s = await import('./_buyer-session')
    return { getBuyerSession: async () => s.getBuyerTestSession() }
})

import {
    createSupportTicket,
    getConstructionTimeline,
    listSupportTickets,
} from '@/app/actions/buyer-portal'
import { setBuyerTestSession } from './_buyer-session'
import { Cleanup, disconnect, makeContact, prisma, uid } from './harness'

let cleanup: Cleanup
beforeEach(() => {
    cleanup = new Cleanup()
    setBuyerTestSession(null)
})
afterEach(async () => {
    setBuyerTestSession(null)
    await cleanup.run()
})
afterAll(async () => {
    await disconnect()
})

describe('Buyer portal — DB integration (Property 64: data isolation)', () => {
    it('listSupportTickets returns only the session buyer tickets', async () => {
        const contactA = await makeContact(cleanup)
        const contactB = await makeContact(cleanup)

        // Seed one ticket per buyer directly.
        const ticketA = await prisma.supportTicket.create({
            data: {
                contactId: contactA.id,
                subject: `A subject ${uid()}`,
                description: 'Buyer A issue',
            },
        })
        cleanup.add(() => prisma.supportTicket.delete({ where: { id: ticketA.id } }))
        const ticketB = await prisma.supportTicket.create({
            data: {
                contactId: contactB.id,
                subject: `B subject ${uid()}`,
                description: 'Buyer B issue',
            },
        })
        cleanup.add(() => prisma.supportTicket.delete({ where: { id: ticketB.id } }))

        // Acting as buyer A.
        setBuyerTestSession({ sessionId: 1, contactId: contactA.id, phone: contactA.phone })

        const res = await listSupportTickets()
        expect(res.success).toBe(true)
        if (!res.success) return

        const ids = res.data.map((t) => t.id)
        expect(ids).toContain(ticketA.id)
        expect(ids).not.toContain(ticketB.id)
        // Property 64: NOTHING outside the session contact leaks through.
        expect(res.data.every((t) => t.id === ticketA.id || ids.includes(t.id))).toBe(true)
        expect(ids).toEqual([ticketA.id])
    })

    it('createSupportTicket attributes the ticket to the session buyer, never the caller', async () => {
        const contactA = await makeContact(cleanup)
        const contactB = await makeContact(cleanup)

        setBuyerTestSession({ sessionId: 2, contactId: contactA.id, phone: contactA.phone })

        const created = await createSupportTicket({
            subject: `Ticket ${uid()}`,
            description: 'Please help with my booking',
        })
        expect(created.success).toBe(true)
        if (!created.success) return
        cleanup.add(() => prisma.supportTicket.delete({ where: { id: created.data.id } }))

        const row = await prisma.supportTicket.findUnique({ where: { id: created.data.id } })
        // The new ticket is owned by buyer A — not buyer B, even though B exists.
        expect(row?.contactId).toBe(contactA.id)
        expect(row?.contactId).not.toBe(contactB.id)

        // And buyer B cannot see buyer A's freshly created ticket.
        setBuyerTestSession({ sessionId: 3, contactId: contactB.id, phone: contactB.phone })
        const asB = await listSupportTickets()
        expect(asB.success).toBe(true)
        if (asB.success) {
            expect(asB.data.map((t) => t.id)).not.toContain(created.data.id)
        }
    })

    it('getConstructionTimeline is scoped to the session buyer bookings', async () => {
        const contactA = await makeContact(cleanup)
        setBuyerTestSession({ sessionId: 4, contactId: contactA.id, phone: contactA.phone })

        // Buyer A has no bookings, so the timeline is empty — it is derived
        // solely from the session contact's own bookings (Req 18.6, 21.2).
        const res = await getConstructionTimeline()
        expect(res.success).toBe(true)
        if (res.success) {
            expect(res.data).toEqual([])
        }
    })
})
