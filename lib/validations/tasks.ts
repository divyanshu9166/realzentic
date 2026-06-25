import { z } from 'zod'
import { idSchema } from '@/lib/validations/common'

/** Task type / category. */
export const taskTypeEnum = z.enum([
    'Follow-up',
    'Call',
    'Site Visit',
    'Documentation',
    'Payment',
    'Meeting',
    'Other',
])

export const taskPriorityEnum = z.enum(['Low', 'Medium', 'High'])
export const taskStatusEnum = z.enum(['Open', 'Done', 'Cancelled'])

export const createTaskSchema = z.object({
    title: z.string().trim().min(1, 'A task title is required').max(200),
    description: z.string().trim().max(2000).optional(),
    type: taskTypeEnum.default('Follow-up'),
    priority: taskPriorityEnum.default('Medium'),
    dueDate: z.string().min(1, 'A due date is required'),
    assignedToId: idSchema.optional().nullable(),
    contactId: idSchema.optional().nullable(),
    dealId: idSchema.optional().nullable(),
})

export const updateTaskSchema = z.object({
    id: idSchema,
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    type: taskTypeEnum.optional(),
    priority: taskPriorityEnum.optional(),
    dueDate: z.string().min(1).optional(),
    assignedToId: idSchema.optional().nullable(),
})

export const setTaskStatusSchema = z.object({
    id: idSchema,
    status: taskStatusEnum,
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type TaskType = z.infer<typeof taskTypeEnum>
export type TaskPriority = z.infer<typeof taskPriorityEnum>
export type TaskStatus = z.infer<typeof taskStatusEnum>
