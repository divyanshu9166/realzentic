/**
 * Integration test for the Gamification service (`app/actions/gamification.ts`),
 * run against the real Postgres database.
 *
 * Covers:
 *   - 18.4 (Property 49) awardBadges is idempotent: repeated invocations create
 *     exactly one AgentBadge per (staff, badge, period) (Req 13.4).
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

import { awardBadges } from '@/app/actions/gamification'
import { Cleanup, disconnect, makeStaff, prisma, uid } from './harness'

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

describe('Gamification — DB integration (18.4 / Property 49)', () => {
    it('awardBadges is idempotent: exactly one AgentBadge per (staff, badge, period)', async () => {
        const staff = await makeStaff(cleanup)
        const period = '2024-07'

        const score = await prisma.agentScore.create({
            data: { staffId: staff.id, period, metrics: { deals: 20 } },
        })
        cleanup.add(() => prisma.agentScore.delete({ where: { id: score.id } }))

        const badge = await prisma.badge.create({
            data: { name: `Closer ${uid()}`, criteria: { deals: 10 } },
        })
        cleanup.add(() => prisma.agentBadge.deleteMany({ where: { badgeId: badge.id } }))
        cleanup.add(() => prisma.badge.delete({ where: { id: badge.id } }))

        // Award twice — the second call must be a no-op for this combination.
        const first = await awardBadges({ staffId: staff.id, period })
        const second = await awardBadges({ staffId: staff.id, period })

        expect(first.success).toBe(true)
        expect(second.success).toBe(true)

        // Exactly one AgentBadge exists for (staff, badge, period).
        const agentBadges = await prisma.agentBadge.findMany({
            where: { staffId: staff.id, badgeId: badge.id, period },
        })
        expect(agentBadges).toHaveLength(1)
    })
})
