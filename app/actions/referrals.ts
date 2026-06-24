'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { computeReward, isSelfReferral } from '@/lib/referrals'
import {
    createReferralSchema,
    markReferralEligibleSchema,
    payReferralRewardSchema,
    referralProgramSchema,
} from '@/lib/validations/referrals'
import type { Prisma } from '@prisma/client'

/**
 * Referral_Service server actions (Module 16 / Requirement 19).
 *
 * These actions back the referral program surface:
 *   - `createReferralProgram` / `updateReferralProgram` — persist a
 *     ReferralProgram with name, reward type/value, active flag, terms, and
 *     validity window (Req 19.1).
 *   - `createReferral`        — persist a Referral linking referrer, referred
 *     contact, program, and optional deal; a self-referral (referrer ==
 *     referred) is rejected via the pure `isSelfReferral` helper (Req 19.2,
 *     19.7).
 *   - `markReferralEligible`  — when a referred contact's deal reaches a won
 *     stage, mark the referral eligible and compute its reward amount from the
 *     program via the pure `computeReward` helper (Req 19.3).
 *   - `payReferralReward`     — record a paid reward by setting the reward-paid
 *     flag and paid date (Req 19.4).
 *
 * Conventions follow the existing `app/actions/*` style: a `'use server'`
 * module that validates input with Zod, returns a discriminated
 * `{ success, data | error }` result, and revalidates affected paths.
 */

const REFERRALS_PATH = '/referrals'

type Result<T> = { success: true; data: T } | { success: false; error: string }

// ─── Referral program persistence (Req 19.1) ─────────

export async function createReferralProgram(
    data: unknown
): Promise<Result<{ id: number }>> {
    try {
        await requireRole('ADMIN', 'MANAGER')
    } catch {
        return { success: false, error: 'Admin or manager access required' }
    }

    const parsed = referralProgramSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }

    const input = parsed.data

    const program = await prisma.referralProgram.create({
        data: {
            name: input.name,
            rewardType: input.rewardType,
            rewardValue: input.rewardValue,
            active: input.active,
            terms: input.terms ?? null,
            validFrom: input.validFrom ?? null,
            validUntil: input.validUntil ?? null,
        },
        select: { id: true },
    })

    revalidatePath(REFERRALS_PATH)
    return { success: true, data: { id: program.id } }
}

export async function updateReferralProgram(
    id: number,
    data: unknown
): Promise<Result<{ id: number }>> {
    try {
        await requireRole('ADMIN', 'MANAGER')
    } catch {
        return { success: false, error: 'Admin or manager access required' }
    }

    const parsed = referralProgramSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }

    const existing = await prisma.referralProgram.findUnique({
        where: { id },
        select: { id: true },
    })
    if (!existing) return { success: false, error: 'Referral program not found' }

    const input = parsed.data

    const program = await prisma.referralProgram.update({
        where: { id },
        data: {
            name: input.name,
            rewardType: input.rewardType,
            rewardValue: input.rewardValue,
            active: input.active,
            terms: input.terms ?? null,
            validFrom: input.validFrom ?? null,
            validUntil: input.validUntil ?? null,
        },
        select: { id: true },
    })

    revalidatePath(REFERRALS_PATH)
    return { success: true, data: { id: program.id } }
}

// ─── Referral creation (Req 19.2, 19.7) ──────────────

export async function createReferral(data: unknown): Promise<Result<{ id: number }>> {
    try {
        await requireRole('ADMIN', 'MANAGER', 'STAFF')
    } catch {
        return { success: false, error: 'Unauthorized' }
    }

    const parsed = createReferralSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }

    const { referrerId, referredId, programId, dealId, status } = parsed.data

    // Req 19.7: a contact cannot refer themselves.
    if (isSelfReferral(referrerId, referredId)) {
        return { success: false, error: 'A contact cannot refer themselves' }
    }

    // Referential integrity (Req 20.8): every foreign key must resolve.
    const [referrer, referred, program] = await Promise.all([
        prisma.contact.findUnique({ where: { id: referrerId }, select: { id: true } }),
        prisma.contact.findUnique({ where: { id: referredId }, select: { id: true } }),
        prisma.referralProgram.findUnique({ where: { id: programId }, select: { id: true } }),
    ])
    if (!referrer) return { success: false, error: 'Referrer contact not found' }
    if (!referred) return { success: false, error: 'Referred contact not found' }
    if (!program) return { success: false, error: 'Referral program not found' }

    if (dealId !== undefined) {
        const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true } })
        if (!deal) return { success: false, error: 'Deal not found' }
    }

    const referral = await prisma.referral.create({
        data: {
            referrerId,
            referredId,
            programId,
            dealId: dealId ?? null,
            status,
        },
        select: { id: true },
    })

    revalidatePath(REFERRALS_PATH)
    return { success: true, data: { id: referral.id } }
}

// ─── Mark eligible on won deal (Req 19.3) ────────────

export async function markReferralEligible(
    data: unknown
): Promise<Result<{ id: number; rewardAmount: number }>> {
    try {
        await requireRole('ADMIN', 'MANAGER')
    } catch {
        return { success: false, error: 'Admin or manager access required' }
    }

    const parsed = markReferralEligibleSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }

    const referral = await prisma.referral.findUnique({
        where: { id: parsed.data.referralId },
        include: { program: true },
    })
    if (!referral) return { success: false, error: 'Referral not found' }

    // Resolve the won deal: prefer the explicit deal, falling back to the deal
    // already linked on the referral.
    const dealId = parsed.data.dealId ?? referral.dealId ?? undefined
    if (dealId === undefined) {
        return { success: false, error: 'A deal is required to mark a referral eligible' }
    }

    const deal = await prisma.deal.findUnique({
        where: { id: dealId },
        select: { id: true, contactId: true, stage: { select: { isWon: true } } },
    })
    if (!deal) return { success: false, error: 'Deal not found' }

    // Req 19.3: eligibility is driven by the referred contact's deal reaching a
    // won stage. Guard both conditions.
    if (deal.contactId !== referral.referredId) {
        return { success: false, error: "Deal does not belong to the referred contact" }
    }
    if (!deal.stage.isWon) {
        return { success: false, error: 'Deal has not reached a won stage' }
    }

    // Compute the reward from the program reward value (Req 19.3).
    const rewardAmount = computeReward(referral.program)

    const updated = await prisma.referral.update({
        where: { id: referral.id },
        data: {
            status: 'Eligible',
            rewardAmount,
            dealId,
        },
        select: { id: true, rewardAmount: true },
    })

    revalidatePath(REFERRALS_PATH)
    return { success: true, data: { id: updated.id, rewardAmount: toNumber(updated.rewardAmount) } }
}

// ─── Reward payout (Req 19.4) ────────────────────────

export async function payReferralReward(
    data: unknown
): Promise<Result<{ id: number; paidDate: Date }>> {
    try {
        await requireRole('ADMIN', 'MANAGER')
    } catch {
        return { success: false, error: 'Admin or manager access required' }
    }

    const parsed = payReferralRewardSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }

    const referral = await prisma.referral.findUnique({
        where: { id: parsed.data.referralId },
        select: { id: true, status: true, rewardPaid: true },
    })
    if (!referral) return { success: false, error: 'Referral not found' }
    if (referral.rewardPaid) {
        return { success: false, error: 'Referral reward has already been paid' }
    }
    if (referral.status !== 'Eligible') {
        return { success: false, error: 'Only an eligible referral reward can be paid' }
    }

    const paidDate = new Date()

    // Req 19.4: paying a reward sets the reward-paid flag and the paid date.
    const updated = await prisma.referral.update({
        where: { id: referral.id },
        data: {
            rewardPaid: true,
            paidDate,
            status: 'Paid',
        },
        select: { id: true, paidDate: true },
    })

    revalidatePath(REFERRALS_PATH)
    return { success: true, data: { id: updated.id, paidDate: updated.paidDate ?? paidDate } }
}

// ─── Reads (back the referrals UI, Req 19.5) ─────────

export async function listReferralPrograms() {
    try {
        await requireRole('ADMIN', 'MANAGER', 'STAFF')
    } catch {
        return { success: false as const, error: 'Unauthorized' }
    }

    const programs = await prisma.referralProgram.findMany({ orderBy: { id: 'desc' } })
    return { success: true as const, data: programs }
}

export async function listReferrals() {
    try {
        await requireRole('ADMIN', 'MANAGER', 'STAFF')
    } catch {
        return { success: false as const, error: 'Unauthorized' }
    }

    const referrals = await prisma.referral.findMany({
        orderBy: { id: 'desc' },
        include: {
            referrer: { select: { id: true, name: true } },
            referred: { select: { id: true, name: true } },
            program: { select: { id: true, name: true, rewardType: true } },
        },
    })
    return { success: true as const, data: referrals }
}

// ─── Helpers ─────────────────────────────────────────

/** Convert a Prisma `Decimal` (or numeric) to a JS number. */
function toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) return 0
    return typeof value === 'number' ? value : Number(value)
}
