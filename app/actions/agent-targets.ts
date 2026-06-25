'use server'

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const upsertAgentTargetSchema = z.object({
    staffId: z.number().int().positive(),
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM'),
    periodType: z.enum(['monthly', 'quarterly']).default('monthly'),
    unitTarget: z.number().int().min(0).default(0),
    revenueTarget: z.number().min(0).default(0),
    incentiveStructure: z.array(z.object({
        threshold: z.number(),
        bonus: z.number(),
    })).optional(),
    notes: z.string().max(500).optional(),
})

const syncAttainmentSchema = z.object({
    staffId: z.number().int().positive(),
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safePct(achieved: number, target: number): number {
    if (target <= 0) return 0
    return Math.round((achieved / target) * 100 * 10) / 10
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Create or update a monthly/quarterly sales target for a staff member.
 * Restricted to ADMIN and MANAGER roles.
 */
export async function upsertAgentTarget(data: unknown) {
    await requireRole('ADMIN', 'MANAGER')

    const parsed = upsertAgentTargetSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }
    const input = parsed.data

    // Verify the staff member exists
    const staff = await prisma.staff.findUnique({ where: { id: input.staffId } })
    if (!staff) {
        return { success: false, error: 'Staff member not found' }
    }

    const target = await prisma.agentTarget.upsert({
        where: { staffId_period: { staffId: input.staffId, period: input.period } },
        create: {
            staffId: input.staffId,
            period: input.period,
            periodType: input.periodType,
            unitTarget: input.unitTarget,
            revenueTarget: input.revenueTarget,
            incentiveStructure: input.incentiveStructure ?? undefined,
            notes: input.notes,
        },
        update: {
            periodType: input.periodType,
            unitTarget: input.unitTarget,
            revenueTarget: input.revenueTarget,
            incentiveStructure: input.incentiveStructure ?? undefined,
            notes: input.notes,
        },
        include: { staff: { select: { id: true, name: true, role: true } } },
    })

    revalidatePath('/staff')
    return { success: true, data: target }
}

/**
 * List all staff agent targets for a given period (defaults to current month).
 * Returns attainment percentages alongside raw achieved/target values.
 */
export async function getAgentTargets(period?: string) {
    const activePeriod = period ?? new Date().toISOString().slice(0, 7) // YYYY-MM

    const targets = await prisma.agentTarget.findMany({
        where: { period: activePeriod },
        include: {
            staff: {
                select: {
                    id: true,
                    name: true,
                    role: true,
                    avatar: true,
                    status: true,
                },
            },
        },
        orderBy: { staff: { name: 'asc' } },
    })

    const mapped = targets.map((t) => ({
        id: t.id,
        staffId: t.staffId,
        staffName: t.staff.name,
        staffRole: t.staff.role,
        staffAvatar: t.staff.avatar,
        staffStatus: t.staff.status,
        period: t.period,
        periodType: t.periodType,
        unitTarget: t.unitTarget,
        unitAchieved: t.unitAchieved,
        unitAttainmentPct: safePct(t.unitAchieved, t.unitTarget),
        revenueTarget: Number(t.revenueTarget),
        revenueAchieved: Number(t.revenueAchieved),
        revenueAttainmentPct: safePct(Number(t.revenueAchieved), Number(t.revenueTarget)),
        incentiveStructure: t.incentiveStructure,
        notes: t.notes,
        updatedAt: t.updatedAt.toISOString(),
    }))

    return { success: true, data: mapped, period: activePeriod }
}

/**
 * Recompute unitAchieved and revenueAchieved for a staff member in a period
 * by counting deals that were won during that calendar month.
 * Restricted to ADMIN and MANAGER roles.
 */
export async function syncAgentAttainment(staffId: number, period: string) {
    await requireRole('ADMIN', 'MANAGER')

    const input = syncAttainmentSchema.safeParse({ staffId, period })
    if (!input.success) {
        return { success: false, error: input.error.issues[0].message }
    }

    // Build date range for the period (full calendar month in UTC)
    const [yearStr, monthStr] = period.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10) // 1-based
    const periodStart = new Date(Date.UTC(year, month - 1, 1))
    const periodEnd = new Date(Date.UTC(year, month, 1)) // exclusive

    // Find the AgentTarget record
    const target = await prisma.agentTarget.findUnique({
        where: { staffId_period: { staffId, period } },
    })
    if (!target) {
        return { success: false, error: 'No target record found for this staff member and period.' }
    }

    // Aggregate won deals assigned to this staff member in the period
    const wonDeals = await prisma.deal.findMany({
        where: {
            assignedAgentId: staffId,
            wonDate: { gte: periodStart, lt: periodEnd },
        },
        select: { value: true },
    })

    const unitAchieved = wonDeals.length
    const revenueAchieved = wonDeals.reduce((sum, d) => sum + Number(d.value), 0)

    const updated = await prisma.agentTarget.update({
        where: { id: target.id },
        data: { unitAchieved, revenueAchieved },
        include: { staff: { select: { id: true, name: true } } },
    })

    revalidatePath('/staff')
    return {
        success: true,
        data: {
            staffName: updated.staff.name,
            period,
            unitAchieved,
            revenueAchieved,
        },
    }
}
