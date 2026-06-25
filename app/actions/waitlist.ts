'use server'

/**
 * Server actions for the Pre-launch / Waitlist management feature.
 *
 * Covers:
 *   - addToWaitlist        — create a UnitWaitlist entry (ADMIN/MANAGER)
 *   - getWaitlistForProject — list all entries for a project with contact info
 *   - updateWaitlistStatus — change status (ADMIN/MANAGER)
 *   - convertWaitlistToBooking — mark an entry Converted
 *
 * Conventions match the existing app/actions/*.ts style:
 *   - `'use server'` module with prisma from @/lib/db
 *   - Zod validation on all inputs
 *   - Returns { success: true, data } | { success: false, error }
 *   - requireRole for writes
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/auth-helpers'

// ─── Result type ──────────────────────────────────────────────────────────────

export type Result<T> =
    | { success: true; data: T }
    | { success: false; error: string }

// ─── Validation schemas ───────────────────────────────────────────────────────

const addToWaitlistSchema = z.object({
    projectId: z.number().int().positive('Project ID is required'),
    contactId: z.number().int().positive('Contact ID is required'),
    unitId: z.number().int().positive().optional(),
    config: z.string().max(200).optional(),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    notes: z.string().max(1000).optional(),
}).refine(
    (d) => d.budgetMax == null || d.budgetMin == null || d.budgetMax >= d.budgetMin,
    { message: 'Budget max must be ≥ budget min', path: ['budgetMax'] },
)

const VALID_STATUSES = ['Waiting', 'Offered', 'Converted', 'Withdrawn'] as const
type WaitlistStatus = (typeof VALID_STATUSES)[number]

const statusSchema = z.enum(VALID_STATUSES)

// ─── Serialization helper ─────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
    if (v == null) return null
    return Number(v)
}

// ─── WaitlistEntry shape returned to the client ───────────────────────────────

export interface WaitlistEntry {
    id: number
    projectId: number
    contactId: number
    contactName: string
    contactPhone: string | null
    unitId: number | null
    unitNumber: string | null
    config: string | null
    budgetMin: number | null
    budgetMax: number | null
    priority: number
    status: string
    notes: string | null
    registeredAt: string
}

// ─── addToWaitlist ────────────────────────────────────────────────────────────

/**
 * Create a new UnitWaitlist entry for a project.
 * Requires ADMIN or MANAGER role.
 */
export async function addToWaitlist(data: unknown): Promise<Result<WaitlistEntry>> {
    try {
        await requireRole('ADMIN', 'MANAGER')
    } catch {
        return { success: false, error: 'Access denied. ADMIN or MANAGER role required.' }
    }

    const parsed = addToWaitlistSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }

    const { projectId, contactId, unitId, config, budgetMin, budgetMax, notes } = parsed.data

    // Check project exists
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) return { success: false, error: 'Project not found' }

    // Check contact exists
    const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } })
    if (!contact) return { success: false, error: 'Contact not found' }

    // Check unit exists if provided
    if (unitId != null) {
        const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true } })
        if (!unit) return { success: false, error: 'Unit not found' }
    }

    // Determine next priority (highest existing priority + 1 for this project)
    const maxEntry = await prisma.unitWaitlist.findFirst({
        where: { projectId },
        orderBy: { priority: 'desc' },
        select: { priority: true },
    })
    const priority = (maxEntry?.priority ?? 0) + 1

    const entry = await prisma.unitWaitlist.create({
        data: {
            projectId,
            contactId,
            unitId: unitId ?? null,
            config: config ?? null,
            budgetMin: budgetMin != null ? budgetMin : null,
            budgetMax: budgetMax != null ? budgetMax : null,
            priority,
            status: 'Waiting',
            notes: notes ?? null,
        },
        include: {
            contact: { select: { name: true, phone: true } },
            unit: { select: { unitNumber: true } },
        },
    })

    revalidatePath(`/properties/${projectId}`)

    return {
        success: true,
        data: {
            id: entry.id,
            projectId: entry.projectId,
            contactId: entry.contactId,
            contactName: entry.contact.name,
            contactPhone: entry.contact.phone,
            unitId: entry.unitId,
            unitNumber: entry.unit?.unitNumber ?? null,
            config: entry.config,
            budgetMin: toNum(entry.budgetMin),
            budgetMax: toNum(entry.budgetMax),
            priority: entry.priority,
            status: entry.status,
            notes: entry.notes,
            registeredAt: entry.registeredAt.toISOString(),
        },
    }
}

// ─── getWaitlistForProject ────────────────────────────────────────────────────

/**
 * List all waitlist entries for a project with contact name/phone, unit number,
 * status, and priority. Ordered by priority ascending.
 */
export async function getWaitlistForProject(projectId: unknown): Promise<Result<WaitlistEntry[]>> {
    const parsed = z.number().int().positive().safeParse(projectId)
    if (!parsed.success) return { success: false, error: 'Invalid project ID' }

    const entries = await prisma.unitWaitlist.findMany({
        where: { projectId: parsed.data },
        orderBy: [{ priority: 'asc' }, { registeredAt: 'asc' }],
        include: {
            contact: { select: { name: true, phone: true } },
            unit: { select: { unitNumber: true } },
        },
    })

    return {
        success: true,
        data: entries.map((e) => ({
            id: e.id,
            projectId: e.projectId,
            contactId: e.contactId,
            contactName: e.contact.name,
            contactPhone: e.contact.phone,
            unitId: e.unitId,
            unitNumber: e.unit?.unitNumber ?? null,
            config: e.config,
            budgetMin: toNum(e.budgetMin),
            budgetMax: toNum(e.budgetMax),
            priority: e.priority,
            status: e.status,
            notes: e.notes,
            registeredAt: e.registeredAt.toISOString(),
        })),
    }
}

// ─── updateWaitlistStatus ─────────────────────────────────────────────────────

/**
 * Change the status of a waitlist entry.
 * Requires ADMIN or MANAGER role.
 */
export async function updateWaitlistStatus(
    id: unknown,
    status: unknown,
): Promise<Result<{ id: number; status: string }>> {
    try {
        await requireRole('ADMIN', 'MANAGER')
    } catch {
        return { success: false, error: 'Access denied. ADMIN or MANAGER role required.' }
    }

    const idParsed = z.number().int().positive().safeParse(id)
    if (!idParsed.success) return { success: false, error: 'Invalid waitlist entry ID' }

    const statusParsed = statusSchema.safeParse(status)
    if (!statusParsed.success) {
        return { success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }
    }

    const entry = await prisma.unitWaitlist.findUnique({
        where: { id: idParsed.data },
        select: { id: true, status: true, projectId: true },
    })
    if (!entry) return { success: false, error: 'Waitlist entry not found' }

    const updated = await prisma.unitWaitlist.update({
        where: { id: idParsed.data },
        data: { status: statusParsed.data },
        select: { id: true, status: true, projectId: true },
    })

    revalidatePath(`/properties/${updated.projectId}`)

    return { success: true, data: { id: updated.id, status: updated.status } }
}

// ─── convertWaitlistToBooking ─────────────────────────────────────────────────

/**
 * Mark a waitlist entry as Converted (the booking itself is handled separately).
 * Requires ADMIN or MANAGER role.
 */
export async function convertWaitlistToBooking(
    waitlistId: unknown,
): Promise<Result<{ id: number; status: WaitlistStatus }>> {
    try {
        await requireRole('ADMIN', 'MANAGER')
    } catch {
        return { success: false, error: 'Access denied. ADMIN or MANAGER role required.' }
    }

    const idParsed = z.number().int().positive().safeParse(waitlistId)
    if (!idParsed.success) return { success: false, error: 'Invalid waitlist entry ID' }

    const entry = await prisma.unitWaitlist.findUnique({
        where: { id: idParsed.data },
        select: { id: true, status: true, projectId: true },
    })
    if (!entry) return { success: false, error: 'Waitlist entry not found' }
    if (entry.status === 'Converted') {
        return { success: false, error: 'Entry is already converted' }
    }
    if (entry.status === 'Withdrawn') {
        return { success: false, error: 'Cannot convert a withdrawn entry' }
    }

    const updated = await prisma.unitWaitlist.update({
        where: { id: idParsed.data },
        data: { status: 'Converted' },
        select: { id: true, status: true, projectId: true },
    })

    revalidatePath(`/properties/${updated.projectId}`)

    return { success: true, data: { id: updated.id, status: updated.status as WaitlistStatus } }
}

// ─── searchContactsForWaitlist ────────────────────────────────────────────────

/**
 * Search contacts by name or phone for the waitlist add form (free-text).
 * Returns up to 20 matches.
 */
export async function searchContactsForWaitlist(
    query: unknown,
): Promise<Result<{ id: number; name: string; phone: string | null }[]>> {
    const q = z.string().min(1).max(100).safeParse(query)
    if (!q.success) return { success: false, error: 'Search query required' }

    const contacts = await prisma.contact.findMany({
        where: {
            OR: [
                { name: { contains: q.data, mode: 'insensitive' } },
                { phone: { contains: q.data } },
            ],
        },
        select: { id: true, name: true, phone: true },
        orderBy: { name: 'asc' },
        take: 20,
    })

    return { success: true, data: contacts }
}
