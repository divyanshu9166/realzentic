'use server'

/**
 * Unified calendar — merges every dated activity into one feed:
 *   - Appointments (date + time)
 *   - Scheduled site visits (FieldVisit.scheduledDate)
 *   - Tasks (dueDate)
 *   - Payment milestones (BookingMilestone.dueDate)
 *
 * Read-only aggregation over existing tables; no new model. Callers pass the
 * visible window (`start`/`end` ISO dates) and receive a flat, sorted list of
 * events the `/calendar` view groups by day.
 */

import { prisma } from '@/lib/db'

export type CalendarEventType = 'appointment' | 'site-visit' | 'task' | 'payment'

export interface CalendarEvent {
    id: string
    type: CalendarEventType
    title: string
    subtitle: string | null
    date: string // ISO datetime
    time: string | null
    status: string | null
}

function monthRange(): { start: Date; end: Date } {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { start, end }
}

export async function getCalendarEvents(range?: { start?: string; end?: string }): Promise<{
    success: boolean
    data: CalendarEvent[]
}> {
    try {
        const def = monthRange()
        const start = range?.start ? new Date(range.start) : def.start
        const end = range?.end ? new Date(range.end) : def.end
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return { success: false, data: [] }
        }
        const within = { gte: start, lt: end }

        const [appointments, visits, tasks, milestones] = await Promise.all([
            prisma.appointment.findMany({
                where: { date: within },
                include: { contact: { select: { name: true } } },
                take: 500,
            }),
            prisma.fieldVisit.findMany({
                where: { scheduledDate: within },
                take: 500,
            }),
            prisma.task.findMany({
                where: { dueDate: within },
                include: { contact: { select: { name: true } }, assignedTo: { select: { name: true } } },
                take: 500,
            }),
            prisma.bookingMilestone.findMany({
                where: { dueDate: within },
                include: { booking: { select: { contact: { select: { name: true } } } } },
                take: 500,
            }),
        ])

        const events: CalendarEvent[] = []

        for (const a of appointments) {
            events.push({
                id: `appt-${a.id}`,
                type: 'appointment',
                title: a.purpose || 'Appointment',
                subtitle: a.contact?.name ?? null,
                date: a.date.toISOString(),
                time: a.time ?? null,
                status: a.status ?? null,
            })
        }

        for (const v of visits) {
            if (!v.scheduledDate) continue
            events.push({
                id: `visit-${v.id}`,
                type: 'site-visit',
                title: `Site Visit — ${v.customer}`,
                subtitle: v.address ?? null,
                date: v.scheduledDate.toISOString(),
                time: v.scheduledTime ?? null,
                status: v.status ?? null,
            })
        }

        for (const t of tasks) {
            events.push({
                id: `task-${t.id}`,
                type: 'task',
                title: t.title,
                subtitle: [t.type, t.contact?.name, t.assignedTo?.name ? `→ ${t.assignedTo.name}` : null]
                    .filter(Boolean)
                    .join(' · ') || null,
                date: t.dueDate.toISOString(),
                time: null,
                status: t.status ?? null,
            })
        }

        for (const m of milestones) {
            events.push({
                id: `pay-${m.id}`,
                type: 'payment',
                title: `Payment Due — ${m.name}`,
                subtitle: m.booking?.contact?.name ?? null,
                date: m.dueDate.toISOString(),
                time: null,
                status: m.status ?? null,
            })
        }

        events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        return { success: true, data: events }
    } catch (error) {
        console.error('Error building calendar events:', error)
        return { success: false, data: [] }
    }
}
