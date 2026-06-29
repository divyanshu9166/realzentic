'use server'

/**
 * app/actions/follow-ups.ts
 *
 * Server actions for the Follow-up section: interested prospects who are not
 * ready to buy yet and have given a future date to reconnect.
 *
 *   - getFollowUps            — list follow-ups with due-bucket + days-until.
 *   - getFollowUpCounts       — counts by status + overdue/today/upcoming.
 *   - createFollowUp          — manual add (find-or-create contact by phone).
 *   - convertLeadToFollowUp   — create a follow-up from an existing lead.
 *   - updateFollowUp          — edit date/reason/priority/notes/interest/etc.
 *   - updateFollowUpStatus    — change status (stamps lastContactedAt).
 *   - deleteFollowUp          — remove a follow-up.
 */

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { normalizePhone } from '@/lib/dedup'
import { classifyFollowUpDue, daysUntilFollowUp, type FollowUpDueBucket } from '@/lib/follow-ups'
import {
    createFollowUpSchema,
    convertLeadToFollowUpSchema,
    updateFollowUpSchema,
    updateFollowUpStatusSchema,
} from '@/lib/validations/follow-up'
import type { FollowUpStatus } from '@prisma/client'

const FOLLOWUP_PATH = '/follow-ups'

export interface FollowUpView {
    id: number
    contactId: number
    leadId: number | null
    name: string
    phone: string
    email: string | null
    interest: string
    budget: string | null
    followUpDate: string
    reason: string | null
    status: FollowUpStatus
    priority: string
    source: string | null
    notes: string | null
    assignedTo: string | null
    assignedToId: number | null
    lastContactedAt: string | null
    createdAt: string
    /** Derived: overdue / today / upcoming relative to now. */
    dueBucket: FollowUpDueBucket
    /** Derived: whole days until the follow-up (negative = overdue). */
    daysUntil: number
}

// ─── Find-or-create a contact by phone (mirrors createLead, Req 11.7). ─────────

async function findOrCreateContact(args: {
    name: string
    phone: string
    email?: string | null
    source?: string | null
}) {
    let contact = await prisma.contact.findFirst({ where: { phone: args.phone } })
    if (!contact) {
        const normalizedTarget = normalizePhone(args.phone)
        if (normalizedTarget) {
            const candidates = await prisma.contact.findMany({ select: { id: true, phone: true } })
            const match = candidates.find((c) => normalizePhone(c.phone) === normalizedTarget)
            if (match) contact = await prisma.contact.findUnique({ where: { id: match.id } })
        }
    }
    if (!contact) {
        contact = await prisma.contact.create({
            data: {
                name: args.name,
                phone: args.phone,
                email: args.email || null,
                source: args.source || 'Follow-up',
            },
        })
    }
    return contact
}

// ─── List ──────────────────────────────────────────────────────────────────────

export async function getFollowUps(filter?: { status?: FollowUpStatus }) {
    if (process.env.DEMO_MODE === 'true') {
        const { demoFollowUps } = await import('@/lib/demo-data')
        const followUps = filter?.status ? demoFollowUps.filter(f => f.status === filter.status) : demoFollowUps
        return { success: true as const, data: followUps }
    }

    try {
        const where = filter?.status ? { status: filter.status } : {}
        const rows = await prisma.followUpEntry.findMany({
            where,
            include: { contact: true, assignedTo: { select: { name: true } } },
            orderBy: [{ status: 'asc' }, { followUpDate: 'asc' }],
        })

        const now = Date.now()
        const data: FollowUpView[] = rows.map((r) => {
            const followMs = r.followUpDate.getTime()
            return {
                id: r.id,
                contactId: r.contactId,
                leadId: r.leadId,
                name: r.contact.name,
                phone: r.contact.phone,
                email: r.contact.email,
                interest: r.interest,
                budget: r.budget,
                followUpDate: r.followUpDate.toISOString(),
                reason: r.reason,
                status: r.status,
                priority: r.priority,
                source: r.source,
                notes: r.notes,
                assignedTo: r.assignedTo?.name ?? null,
                assignedToId: r.assignedToId,
                lastContactedAt: r.lastContactedAt?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
                dueBucket: classifyFollowUpDue(followMs, now),
                daysUntil: daysUntilFollowUp(followMs, now),
            }
        })

        return { success: true as const, data }
    } catch (error) {
        console.error('Error loading follow-ups:', error)
        return { success: false as const, error: 'Failed to load follow-ups' }
    }
}

export async function getFollowUpCounts() {
    try {
        const rows = await prisma.followUpEntry.findMany({
            select: { status: true, followUpDate: true },
        })
        const now = Date.now()
        const counts = {
            total: rows.length,
            pending: 0,
            contacted: 0,
            reminded: 0,
            converted: 0,
            lost: 0,
            overdue: 0,
            today: 0,
            upcoming: 0,
        }
        for (const r of rows) {
            if (r.status === 'PENDING') counts.pending++
            else if (r.status === 'CONTACTED') counts.contacted++
            else if (r.status === 'REMINDED') counts.reminded++
            else if (r.status === 'CONVERTED') counts.converted++
            else if (r.status === 'LOST') counts.lost++

            // Due buckets are only meaningful for PENDING follow-ups — those are
            // the ones a reminder will still be sent for.
            if (r.status === 'PENDING') {
                const bucket = classifyFollowUpDue(r.followUpDate.getTime(), now)
                counts[bucket]++
            }
        }
        return { success: true as const, data: counts }
    } catch (error) {
        console.error('Error counting follow-ups:', error)
        return { success: false as const, error: 'Failed to count follow-ups' }
    }
}

// ─── Manual create ───────────────────────────────────────────────────────────────

export async function createFollowUp(input: unknown) {
    const parsed = createFollowUpSchema.safeParse(input)
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message }

    const d = parsed.data
    const followDate = new Date(d.followUpDate)
    if (Number.isNaN(followDate.getTime())) {
        return { success: false as const, error: 'Invalid follow-up date' }
    }

    try {
        const contact = await findOrCreateContact({
            name: d.name,
            phone: d.phone,
            email: d.email || null,
            source: d.source || 'Follow-up',
        })

        const entry = await prisma.followUpEntry.create({
            data: {
                contactId: contact.id,
                interest: d.interest,
                budget: d.budget || null,
                followUpDate: followDate,
                reason: d.reason || null,
                priority: d.priority || 'Medium',
                source: d.source || 'Follow-up',
                notes: d.notes || null,
                assignedToId: d.assignedToId ?? null,
                status: 'PENDING',
            },
        })

        revalidatePath(FOLLOWUP_PATH)
        return { success: true as const, data: entry }
    } catch (error) {
        console.error('Error creating follow-up:', error)
        return { success: false as const, error: 'Failed to create follow-up' }
    }
}

// ─── Convert a lead → follow-up ───────────────────────────────────────────────────

/**
 * Create a follow-up from an existing lead. The lead is preserved and linked
 * (leadId) so history is never lost; we copy its interest/budget/source and
 * mark the lead CONTACTED (if it was still NEW) to reflect the engagement.
 * Both writes run in one transaction.
 */
export async function convertLeadToFollowUp(input: unknown) {
    const parsed = convertLeadToFollowUpSchema.safeParse(input)
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message }

    const d = parsed.data
    const followDate = new Date(d.followUpDate)
    if (Number.isNaN(followDate.getTime())) {
        return { success: false as const, error: 'Invalid follow-up date' }
    }

    try {
        const lead = await prisma.lead.findUnique({
            where: { id: d.leadId },
            include: { contact: true },
        })
        if (!lead) return { success: false as const, error: 'Lead not found' }

        // Guard against duplicating an open follow-up for the same person —
        // checked by contact (covers both this lead and any auto-created
        // follow-up from a WhatsApp "call me later" message).
        const existing = await prisma.followUpEntry.findFirst({
            where: {
                contactId: lead.contactId,
                status: { in: ['PENDING', 'CONTACTED', 'REMINDED'] },
            },
        })
        if (existing) {
            return { success: false as const, error: 'This contact already has an open follow-up' }
        }

        const entry = await prisma.$transaction(async (tx) => {
            const created = await tx.followUpEntry.create({
                data: {
                    contactId: lead.contactId,
                    leadId: lead.id,
                    interest: lead.interest,
                    budget: lead.budget,
                    followUpDate: followDate,
                    reason: d.reason || null,
                    priority: d.priority || 'Medium',
                    source: lead.source || 'Lead',
                    notes: d.notes || null,
                    assignedToId: lead.assignedToId ?? null,
                    status: 'PENDING',
                },
            })

            if (lead.status === 'NEW') {
                await tx.lead.update({ where: { id: lead.id }, data: { status: 'CONTACTED' } })
            }

            return created
        })

        revalidatePath(FOLLOWUP_PATH)
        revalidatePath('/leads')
        return { success: true as const, data: entry }
    } catch (error) {
        console.error('Error converting lead to follow-up:', error)
        return { success: false as const, error: 'Failed to convert lead to follow-up' }
    }
}

// ─── Update ──────────────────────────────────────────────────────────────────────

export async function updateFollowUp(input: unknown) {
    const parsed = updateFollowUpSchema.safeParse(input)
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message }

    const { id, followUpDate, ...rest } = parsed.data
    const data: Record<string, unknown> = { ...rest }

    if (followUpDate !== undefined) {
        const dt = new Date(followUpDate)
        if (Number.isNaN(dt.getTime())) return { success: false as const, error: 'Invalid follow-up date' }
        data.followUpDate = dt
    }

    try {
        // Rescheduling a follow-up that was already reminded should re-arm it so
        // the reminder fires again on the new date.
        if (data.followUpDate !== undefined) {
            const current = await prisma.followUpEntry.findUnique({
                where: { id },
                select: { status: true },
            })
            if (current?.status === 'REMINDED') {
                data.status = 'PENDING'
            }
        }

        const entry = await prisma.followUpEntry.update({ where: { id }, data })
        revalidatePath(FOLLOWUP_PATH)
        return { success: true as const, data: entry }
    } catch (error) {
        console.error('Error updating follow-up:', error)
        return { success: false as const, error: 'Failed to update follow-up' }
    }
}

export async function updateFollowUpStatus(input: unknown) {
    const parsed = updateFollowUpStatusSchema.safeParse(input)
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message }

    const { id, status } = parsed.data
    try {
        const entry = await prisma.followUpEntry.update({
            where: { id },
            data: {
                status,
                // Stamp engagement when the agent actually reaches out / resolves it.
                lastContactedAt:
                    status === 'CONTACTED' || status === 'CONVERTED' ? new Date() : undefined,
            },
        })
        revalidatePath(FOLLOWUP_PATH)
        return { success: true as const, data: entry }
    } catch (error) {
        console.error('Error updating follow-up status:', error)
        return { success: false as const, error: 'Failed to update status' }
    }
}

export async function deleteFollowUp(id: number) {
    try {
        await prisma.followUpEntry.delete({ where: { id } })
        revalidatePath(FOLLOWUP_PATH)
        return { success: true as const }
    } catch (error) {
        console.error('Error deleting follow-up:', error)
        return { success: false as const, error: 'Failed to delete follow-up' }
    }
}
