/**
 * Pure, IO-free helpers for the Deal Pipeline & Booking Engine (Module 3).
 *
 * Every function here is deterministic and side-effect free: no database
 * access, no clock reads (callers pass `now`/`baseDate`), and no network.
 * This keeps the core business rules trivially unit- and property-testable.
 * Server actions in `app/actions/deals.ts` compose these helpers with Prisma.
 *
 * Monetary math is delegated to `lib/money.ts` so deal values, milestone
 * amounts, and payments all share the platform's round-half-up, 2-decimal
 * semantics.
 *
 * Requirements: 4.4, 4.8, 4.9 (deal pipeline), 5.5, 5.8 (booking milestones),
 * 9.7, 9.8 (milestone payments).
 */

import { roundMoney } from './money'

/** The persisted milestone lifecycle states (mirrors Prisma `MilestoneStatus`). */
export type MilestoneStatusValue =
    | 'Upcoming'
    | 'Due'
    | 'Overdue'
    | 'Paid'
    | 'Partially_Paid'

/** Minimal shape of a deal needed for stage-move validation. */
export interface DealLike {
    /** The deal's current stage id. */
    stageId: number
    /** Deal value used by analytics aggregation. */
    value: number
    /** Any lost reason already recorded on the deal. */
    lostReason?: string | null
}

/** Minimal shape of a target stage needed for stage-move validation. */
export interface StageLike {
    id: number
    /** Whether moving into this stage marks the deal as lost. */
    isLost?: boolean
}

/** A single milestone definition inside a `PaymentPlan.milestones` JSON array. */
export interface PlanMilestoneDef {
    name: string
    /** Days after the booking/base date the milestone falls due. */
    dueOffsetDays: number
    /** Share of the agreement value for this milestone (0–100). */
    percentage: number
}

/** A payment plan, or anything carrying a `milestones` array. */
export interface PaymentPlanLike {
    milestones: PlanMilestoneDef[] | unknown
}

/** A milestone generated from a plan (pre-persistence; no DB ids). */
export interface GeneratedMilestone {
    name: string
    dueDate: Date
    amount: number
    paidAmount: number
    status: MilestoneStatusValue
}

/** Minimal milestone shape for status derivation and payment application. */
export interface MilestoneLike {
    amount: number
    paidAmount: number
    dueDate: Date | string
    status?: MilestoneStatusValue
}

/** Result of a validation that may carry an error message. */
export interface ValidationResult {
    ok: boolean
    error?: string
}

/** Result of applying a payment to a milestone. */
export interface ApplyMilestonePaymentResult {
    ok: boolean
    milestone?: MilestoneLike & { paidAmount: number; status: MilestoneStatusValue }
    error?: string
}

/** One aggregated row of deal analytics, grouped by stage. */
export interface DealAnalyticsRow {
    stageId: number
    count: number
    totalValue: number
}

/**
 * Validate moving a deal into a target stage.
 *
 * Rules:
 * - The target stage must exist; a missing stage is rejected (Req 4.4).
 * - Moving into a stage whose `isLost` flag is set requires a non-empty lost
 *   reason — supplied either via `lostReason` or already present on the deal
 *   (Req 4.9).
 *
 * This function only decides validity; the caller is responsible for retaining
 * the deal's current stage on rejection.
 *
 * @param deal The deal being moved.
 * @param targetStage The destination stage, or `null`/`undefined` if it does
 *   not exist.
 * @param lostReason Optional lost reason provided with the move.
 *
 * Requirements: 4.4, 4.9
 */
export function validateStageMove(
    deal: DealLike,
    targetStage: StageLike | null | undefined,
    lostReason?: string | null,
): ValidationResult {
    if (targetStage == null) {
        return { ok: false, error: 'Target stage is invalid: the stage does not exist' }
    }

    if (targetStage.isLost) {
        const reason = String(lostReason ?? deal.lostReason ?? '').trim()
        if (reason.length === 0) {
            return {
                ok: false,
                error: 'A lost reason is required to move this deal to a lost stage',
            }
        }
    }

    return { ok: true }
}

/**
 * Coerce a payment plan (or raw array) into a list of milestone definitions.
 * Non-array inputs yield an empty list.
 */
function normalizeMilestoneDefs(plan: PaymentPlanLike | PlanMilestoneDef[]): PlanMilestoneDef[] {
    const raw: unknown = Array.isArray(plan) ? plan : (plan as PaymentPlanLike)?.milestones
    return Array.isArray(raw) ? (raw as PlanMilestoneDef[]) : []
}

/** Return a new Date that is `days` calendar days after `date`. */
function addDays(date: Date, days: number): Date {
    const result = new Date(date.getTime())
    result.setDate(result.getDate() + (Number.isFinite(days) ? Math.trunc(days) : 0))
    return result
}

/**
 * Generate booking milestones from a payment plan and an agreement value.
 *
 * Each plan milestone contributes `percentage`% of the agreement value, with
 * the final milestone absorbing any rounding remainder so that the sum of all
 * milestone amounts is exactly equal to the (2-decimal) agreement value
 * (Req 5.5). Due dates are derived from `baseDate + dueOffsetDays` and the
 * status of each generated milestone is derived from `baseDate`.
 *
 * An empty plan yields an empty list.
 *
 * @param plan The payment plan (or a raw milestone-definition array).
 * @param agreementValue The booking agreement value to distribute.
 * @param baseDate The booking/base date used to compute due dates.
 *
 * Requirements: 5.5
 */
export function milestonesFromPlan(
    plan: PaymentPlanLike | PlanMilestoneDef[],
    agreementValue: number,
    baseDate: Date,
): GeneratedMilestone[] {
    const defs = normalizeMilestoneDefs(plan)
    if (defs.length === 0) return []

    const basis = roundMoney(agreementValue)
    let allocated = 0

    return defs.map((def, index) => {
        const isLast = index === defs.length - 1
        const pct = Number(def.percentage) || 0
        const amount = isLast ? roundMoney(basis - allocated) : roundMoney((basis * pct) / 100)
        if (!isLast) {
            allocated = roundMoney(allocated + amount)
        }

        const dueDate = addDays(baseDate, Number(def.dueOffsetDays) || 0)
        const milestone = {
            name: String(def.name ?? ''),
            dueDate,
            amount,
            paidAmount: 0,
        }

        return { ...milestone, status: milestoneStatus(milestone, baseDate) }
    })
}

/**
 * Derive a milestone's status from its paid amount and due date relative to
 * `now`.
 *
 * Precedence:
 * 1. Fully paid (`paidAmount >= amount`) → `Paid`.
 * 2. Otherwise, if the due date has passed → `Overdue` (Req 5.8, 9.7).
 * 3. Otherwise, if some amount has been paid → `Partially_Paid`.
 * 4. Otherwise → `Upcoming`.
 *
 * Requirements: 5.8, 9.7
 */
export function milestoneStatus(milestone: MilestoneLike, now: Date): MilestoneStatusValue {
    const amount = roundMoney(Number(milestone.amount) || 0)
    const paid = roundMoney(Number(milestone.paidAmount) || 0)

    if (paid >= amount) return 'Paid'

    const due = milestone.dueDate instanceof Date ? milestone.dueDate : new Date(milestone.dueDate)
    if (now.getTime() > due.getTime()) return 'Overdue'

    if (paid > 0) return 'Partially_Paid'

    return 'Upcoming'
}

/**
 * Apply a payment to a milestone, returning the updated milestone or an error.
 *
 * Validation (Req 9.8): a payment that is not a finite number, is zero or
 * negative, or exceeds the milestone's outstanding amount is rejected and the
 * milestone is left unchanged.
 *
 * On success (Req 9.7): the payment is added to `paidAmount`; the status
 * becomes `Paid` when the new paid amount reaches the milestone amount, and
 * `Partially_Paid` otherwise.
 *
 * Requirements: 9.7, 9.8
 */
export function applyMilestonePayment(
    milestone: MilestoneLike,
    amount: number,
): ApplyMilestonePaymentResult {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        return { ok: false, error: 'Payment amount must be a finite number' }
    }

    const payment = roundMoney(amount)
    if (payment <= 0) {
        return { ok: false, error: 'Payment amount must be greater than zero' }
    }

    const total = roundMoney(Number(milestone.amount) || 0)
    const paid = roundMoney(Number(milestone.paidAmount) || 0)
    const outstanding = roundMoney(total - paid)

    if (payment > outstanding) {
        return {
            ok: false,
            error: `Payment ${payment.toFixed(2)} exceeds the outstanding amount ${outstanding.toFixed(2)}`,
        }
    }

    const newPaid = roundMoney(paid + payment)
    const status: MilestoneStatusValue = newPaid >= total ? 'Paid' : 'Partially_Paid'

    return { ok: true, milestone: { ...milestone, paidAmount: newPaid, status } }
}

/**
 * Aggregate deals into per-stage analytics: the number of deals in each stage
 * and the (2-decimal) sum of their values. Rows are returned sorted by
 * `stageId` for deterministic output (Req 4.8).
 *
 * Requirements: 4.8
 */
export function aggregateDealAnalytics(deals: DealLike[]): DealAnalyticsRow[] {
    const byStage = new Map<number, { count: number; totalValue: number }>()

    for (const deal of deals) {
        const entry = byStage.get(deal.stageId) ?? { count: 0, totalValue: 0 }
        entry.count += 1
        entry.totalValue = roundMoney(entry.totalValue + (Number(deal.value) || 0))
        byStage.set(deal.stageId, entry)
    }

    return Array.from(byStage.entries())
        .map(([stageId, { count, totalValue }]) => ({ stageId, count, totalValue }))
        .sort((a, b) => a.stageId - b.stageId)
}
