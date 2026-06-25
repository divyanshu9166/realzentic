'use server'

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SNAG_CATEGORIES = ['Civil', 'Electrical', 'Plumbing', 'Painting', 'Flooring', 'General'] as const
const SNAG_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const
const SNAG_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'] as const

const createSnagReportSchema = z.object({
    bookingId: z.number().int().positive(),
    contactId: z.number().int().positive().optional(),
    title: z.string().min(2, 'Title is required').max(200),
    description: z.string().max(2000).optional(),
    category: z.enum(SNAG_CATEGORIES).default('General'),
    severity: z.enum(SNAG_SEVERITIES).default('Medium'),
    photoUrls: z.array(z.string().url()).default([]),
    assignedToId: z.number().int().positive().optional(),
})

const updateSnagStatusSchema = z.object({
    id: z.number().int().positive(),
    status: z.enum(SNAG_STATUSES),
})

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Create a new snag / defect report for a booking.
 */
export async function createSnagReport(data: unknown) {
    const parsed = createSnagReportSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }
    const input = parsed.data

    // Verify the booking exists
    const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } })
    if (!booking) {
        return { success: false, error: 'Booking not found' }
    }

    const snag = await prisma.snagReport.create({
        data: {
            bookingId: input.bookingId,
            contactId: input.contactId ?? booking.contactId,
            title: input.title,
            description: input.description,
            category: input.category,
            severity: input.severity,
            photoUrls: input.photoUrls,
            assignedToId: input.assignedToId,
            status: 'Open',
        },
        include: {
            booking: { select: { id: true, dealId: true } },
            contact: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, name: true } },
        },
    })

    revalidatePath(`/deals/${snag.booking.dealId}`)
    revalidatePath('/snags')
    return { success: true, data: snagToView(snag) }
}

/**
 * List snag reports with optional filters for status and/or bookingId.
 */
export async function getSnagReports(filters?: {
    status?: string
    bookingId?: number
}) {
    const snags = await prisma.snagReport.findMany({
        where: {
            ...(filters?.status ? { status: filters.status } : {}),
            ...(filters?.bookingId ? { bookingId: filters.bookingId } : {}),
        },
        include: {
            booking: { select: { id: true, dealId: true } },
            contact: { select: { id: true, name: true, phone: true } },
            assignedTo: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
    })

    return { success: true, data: snags.map(snagToView) }
}

/**
 * Update the status of a snag report.
 * Automatically sets resolvedAt when moving to "Resolved".
 */
export async function updateSnagStatus(id: number, status: string) {
    const parsed = updateSnagStatusSchema.safeParse({ id, status })
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }

    const existing = await prisma.snagReport.findUnique({
        where: { id: parsed.data.id },
        select: { id: true, bookingId: true, booking: { select: { dealId: true } } },
    })
    if (!existing) {
        return { success: false, error: 'Snag report not found' }
    }

    const snag = await prisma.snagReport.update({
        where: { id: parsed.data.id },
        data: {
            status: parsed.data.status,
            resolvedAt: parsed.data.status === 'Resolved' ? new Date() : undefined,
        },
        include: {
            booking: { select: { id: true, dealId: true } },
            contact: { select: { id: true, name: true, phone: true } },
            assignedTo: { select: { id: true, name: true } },
        },
    })

    revalidatePath(`/deals/${snag.booking.dealId}`)
    revalidatePath('/snags')
    return { success: true, data: snagToView(snag) }
}

// ─── View serializer ──────────────────────────────────────────────────────────

function snagToView(s: {
    id: number
    bookingId: number
    contactId: number | null
    title: string
    description: string | null
    category: string
    severity: string
    status: string
    photoUrls: string[]
    assignedToId: number | null
    resolvedAt: Date | null
    createdAt: Date
    updatedAt: Date
    booking: { id: number; dealId: number }
    contact: { id: number; name: string; phone?: string } | null
    assignedTo: { id: number; name: string } | null
}) {
    return {
        id: s.id,
        bookingId: s.bookingId,
        dealId: s.booking.dealId,
        contactId: s.contactId,
        contactName: s.contact?.name ?? null,
        contactPhone: s.contact?.phone ?? null,
        title: s.title,
        description: s.description,
        category: s.category,
        severity: s.severity,
        status: s.status,
        photoUrls: s.photoUrls,
        assignedToId: s.assignedToId,
        assignedToName: s.assignedTo?.name ?? null,
        resolvedAt: s.resolvedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
    }
}
