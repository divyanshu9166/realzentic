import { z } from 'zod'
import { idSchema, moneyAmount } from '@/lib/validations/common'

/**
 * Referral program validation schemas for the Real Estate CRM (Module 16).
 *
 * These Zod schemas enforce required-field, enum, and range checks for the
 * Referral_Service writes so it rejects any persist request that omits a
 * required field, supplies an out-of-range value, or uses an invalid enum
 * value, returning an error that identifies the offending field
 * (Requirements 19.1, 19.2, 20.4).
 *
 * Field names mirror the `ReferralProgram` and `Referral` Prisma models in
 * `prisma/schema.prisma` exactly so a validated payload can be handed straight
 * to Prisma. Reusable primitives are composed from `lib/validations/common.ts`.
 */

// ─── Shared field primitives ─────────────────────────

/** A required, non-empty, trimmed string carrying a field-specific message. */
const requiredString = (field: string) =>
    z
        .string({ message: `${field} is required` })
        .trim()
        .min(1, `${field} is required`)

/** An optional string that treats an empty string as "not provided". */
const optionalString = z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))

/** An optional date (accepts `Date` or ISO string, empty string treated as omitted). */
const optionalDate = z
    .union([z.date(), z.string().trim()])
    .optional()
    .transform((v) => {
        if (v === undefined || v === '') return undefined
        const d = v instanceof Date ? v : new Date(v)
        return d
    })
    .refine((d) => d === undefined || !Number.isNaN(d.getTime()), {
        message: 'Must be a valid date',
    })

/**
 * The reward type stored on `ReferralProgram.rewardType`
 * (a `String` in the schema: `Cash | Discount | Gift`).
 */
export const rewardTypeEnum = z.enum(['Cash', 'Discount', 'Gift'])

// ─── Referral program (Requirement 19.1) ─────────────

export const referralProgramSchema = z
    .object({
        name: requiredString('Program name'),
        rewardType: rewardTypeEnum,
        rewardValue: moneyAmount,
        active: z.boolean().default(true),
        terms: optionalString,
        validFrom: optionalDate,
        validUntil: optionalDate,
    })
    .superRefine((data, ctx) => {
        // A bounded program must not end before it begins.
        if (
            data.validFrom !== undefined &&
            data.validUntil !== undefined &&
            data.validUntil.getTime() < data.validFrom.getTime()
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'validUntil must be on or after validFrom',
                path: ['validUntil'],
            })
        }
    })

// ─── Referral (Requirement 19.2, 19.7) ───────────────

export const createReferralSchema = z.object({
    referrerId: idSchema,
    referredId: idSchema,
    programId: idSchema,
    dealId: idSchema.optional(),
    status: requiredString('Status').default('Pending'),
})

export const markReferralEligibleSchema = z.object({
    referralId: idSchema,
    // The won deal driving eligibility. Optional when the referral already
    // links a deal (`Referral.dealId`).
    dealId: idSchema.optional(),
})

export const payReferralRewardSchema = z.object({
    referralId: idSchema,
})

// ─── Inferred types ──────────────────────────────────

export type ReferralProgramInput = z.infer<typeof referralProgramSchema>
export type CreateReferralInput = z.infer<typeof createReferralSchema>
export type MarkReferralEligibleInput = z.infer<typeof markReferralEligibleSchema>
export type PayReferralRewardInput = z.infer<typeof payReferralRewardSchema>
export type RewardType = z.infer<typeof rewardTypeEnum>
