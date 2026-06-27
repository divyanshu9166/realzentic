'use server'

/**
 * Task & Reminder service — agent to-do / activity management.
 *
 * CRUD + listing for the `/tasks` section and the unified calendar. Tasks can
 * be linked to a contact and/or deal and assigned to a staff member, with a due
 * date, priority and status (Open → Done / Cancelled).
 */

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createTaskSchema, updateTaskSchema, setTaskStatusSchema } from '@/lib/validations/tasks'
import { nextDueDate, isRecurrence } from '@/lib/task-recurrence'

type Result<T> = { success: true; data: T } | { success: false; error: string }

const TASKS_PATH = '/tasks'

export interface TaskRow {
    id: number
    title: string
    description: string | null
    type: string
    priority: string
    status: string
    dueDate: string
    completedAt: string | null
    recurrence: string
    assignedToId: number | null
    assignedToName: string | null
    contactId: number | null
    contactName: string | null
    dealId: number | null
    overdue: boolean
}

function mapTask(t: {
    id: number
    title: string
    description: string | null
    type: string
    priority: string
    status: string
    dueDate: Date
    completedAt: Date | null
    recurrence?: string
    assignedToId: number | null
    assignedTo: { name: string } | null
    contactId: number | null
    contact: { name: string } | null
    dealId: number | null
}): TaskRow {
    return {
        id: t.id,
        title: t.title,
        description: t.description,
        type: t.type,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        recurrence: t.recurrence ?? 'none',
        assignedToId: t.assignedToId,
        assignedToName: t.assignedTo?.name ?? null,
        contactId: t.contactId,
        contactName: t.contact?.name ?? null,
        dealId: t.dealId,
        overdue: t.status === 'Open' && t.dueDate.getTime() < Date.now(),
    }
}

const taskInclude = {
    assignedTo: { select: { name: true } },
    contact: { select: { name: true } },
} as const

/** List tasks, optionally filtered by status and/or assignee. */
export async function getTasks(filters: { status?: string; assignedToId?: number } = {}): Promise<{
    success: boolean
    data: TaskRow[]
}> {
    try {
        const where: Record<string, unknown> = {}
        if (filters.status) where.status = filters.status
        if (filters.assignedToId) where.assignedToId = filters.assignedToId

        const tasks = await prisma.task.findMany({
            where,
            include: taskInclude,
            orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
            take: 500,
        })
        return { success: true, data: tasks.map(mapTask) }
    } catch (error) {
        console.error('Error listing tasks:', error)
        return { success: false, data: [] }
    }
}

export async function createTask(data: unknown): Promise<Result<TaskRow>> {
    const parsed = createTaskSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const d = parsed.data
    const due = new Date(d.dueDate)
    if (Number.isNaN(due.getTime())) return { success: false, error: 'Due date is invalid' }

    // Validate optional FKs so a bad reference fails clearly rather than at write.
    if (d.assignedToId != null) {
        const staff = await prisma.staff.findUnique({ where: { id: d.assignedToId }, select: { id: true } })
        if (!staff) return { success: false, error: 'Assigned staff member not found' }
    }
    if (d.contactId != null) {
        const contact = await prisma.contact.findUnique({ where: { id: d.contactId }, select: { id: true } })
        if (!contact) return { success: false, error: 'Linked contact not found' }
    }

    const task = await prisma.task.create({
        data: {
            title: d.title,
            description: d.description ?? null,
            type: d.type,
            priority: d.priority,
            status: 'Open',
            dueDate: due,
            recurrence: d.recurrence ?? 'none',
            assignedToId: d.assignedToId ?? null,
            contactId: d.contactId ?? null,
            dealId: d.dealId ?? null,
        },
        include: taskInclude,
    })

    revalidatePath(TASKS_PATH)
    return { success: true, data: mapTask(task) }
}

export async function updateTask(data: unknown): Promise<Result<TaskRow>> {
    const parsed = updateTaskSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { id, dueDate, ...rest } = parsed.data
    const updateData: Record<string, unknown> = { ...rest }
    if (dueDate !== undefined) {
        const due = new Date(dueDate)
        if (Number.isNaN(due.getTime())) return { success: false, error: 'Due date is invalid' }
        updateData.dueDate = due
    }

    try {
        const task = await prisma.task.update({ where: { id }, data: updateData, include: taskInclude })
        revalidatePath(TASKS_PATH)
        return { success: true, data: mapTask(task) }
    } catch {
        return { success: false, error: 'Task not found' }
    }
}

/** Mark a task Open / Done / Cancelled (sets completedAt on Done). */
export async function setTaskStatus(data: unknown): Promise<Result<TaskRow>> {
    const parsed = setTaskStatusSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    try {
        const task = await prisma.task.update({
            where: { id: parsed.data.id },
            data: {
                status: parsed.data.status,
                completedAt: parsed.data.status === 'Done' ? new Date() : null,
            },
            include: taskInclude,
        })

        // Recurring tasks: when completed, spawn the next occurrence so the
        // cadence continues without manual re-entry.
        if (parsed.data.status === 'Done' && isRecurrence(task.recurrence) && task.recurrence !== 'none') {
            const next = nextDueDate(task.dueDate, task.recurrence)
            if (next) {
                await prisma.task.create({
                    data: {
                        title: task.title,
                        description: task.description,
                        type: task.type,
                        priority: task.priority,
                        status: 'Open',
                        dueDate: next,
                        recurrence: task.recurrence,
                        assignedToId: task.assignedToId,
                        contactId: task.contactId,
                        dealId: task.dealId,
                    },
                }).catch((err) => console.warn('[tasks] failed to spawn next recurrence:', err))
            }
        }

        revalidatePath(TASKS_PATH)
        return { success: true, data: mapTask(task) }
    } catch {
        return { success: false, error: 'Task not found' }
    }
}

export async function deleteTask(id: number): Promise<Result<{ id: number }>> {
    try {
        await prisma.task.delete({ where: { id } })
        revalidatePath(TASKS_PATH)
        return { success: true, data: { id } }
    } catch {
        return { success: false, error: 'Task not found' }
    }
}
