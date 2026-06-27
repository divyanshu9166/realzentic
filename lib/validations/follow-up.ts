import { z } from 'zod'

/**
 * Zod schemas for the Follow-up section (`app/actions/follow-ups.ts`).
 */

const statusEnum = z.enum(['PENDING', 'CONTACTED', 'REMINDED', 'CONVERTED', 'LOST'])
const priorityEnum = z.enum(['Low', 'Medium', 'High'])

/** Create a follow-up manually (finds or creates the contact by phone). */
export const createFollowUpSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    phone: z.string().trim().min(6, 'A valid phone number is required'),
    email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
    interest: z.string().trim().min(1, 'Interest is required'),
    budget: z.string().trim().optional(),
    followUpDate: z.string().min(1, 'A follow-up date is required'),
    reason: z.string().trim().optional(),
    priority: priorityEnum.optional(),
    source: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    assignedToId: z.number().int().positive().optional(),
})

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>

/** Convert an existing lead into a follow-up. */
export const convertLeadToFollowUpSchema = z.object({
    leadId: z.number().int().positive(),
    followUpDate: z.string().min(1, 'A follow-up date is required'),
    reason: z.string().trim().optional(),
    priority: priorityEnum.optional(),
    notes: z.string().trim().optional(),
})

export type ConvertLeadToFollowUpInput = z.infer<typeof convertLeadToFollowUpSchema>

/** Update an existing follow-up's editable fields. */
export const updateFollowUpSchema = z.object({
    id: z.number().int().positive(),
    followUpDate: z.string().min(1).optional(),
    reason: z.string().trim().optional(),
    priority: priorityEnum.optional(),
    notes: z.string().trim().optional(),
    interest: z.string().trim().min(1).optional(),
    budget: z.string().trim().optional(),
    assignedToId: z.number().int().positive().nullable().optional(),
})

export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>

/** Update only the status (with an automatic last-contacted stamp). */
export const updateFollowUpStatusSchema = z.object({
    id: z.number().int().positive(),
    status: statusEnum,
})

export type UpdateFollowUpStatusInput = z.infer<typeof updateFollowUpStatusSchema>
