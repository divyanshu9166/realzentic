/**
 * Cost Sheet pure functions for the Real Estate CRM (Module 2).
 *
 * Every function here is PURE: it performs no database access, no I/O, and no
 * mutation of its inputs. This keeps the financial logic deterministic and
 * directly property-testable. All monetary math reuses the shared helpers in
 * `lib/money.ts` (`roundMoney`, `assertMoneyRange`) so the entire platform
 * shares identical rounding (round-half-up to 2 dp) and range
 * (`0.00 … 999,999,999.99`) semantics.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11
 * Design properties: 12 (net payable composition), 13 (discount floor),
 * 14 (stamp duty state rate), 15 (GST rate over status), 16 (milestone split).
 */

import { assertMoneyRange, roundMoney } from './money'

// ---------------------------------------------------------------------------
// Project status (mirrors the Prisma `ProjectStatus` enum). Kept as a local
// string union so this module stays free of any Prisma/runtime dependency.
// ---------------------------------------------------------------------------

export type ProjectStatus = 'Upcoming' | 'UnderConstruction' | 'ReadyToMove'

// ---------------------------------------------------------------------------
// GST (Req 3.6, 3.7, 3.8 / Property 15)
// ---------------------------------------------------------------------------

/** GST rate (as a fraction) applied while a project is Under Construction. */
export const GST_RATE_UNDER_CONSTRUCTION = 0.05
/** GST rate (as a fraction) applied while a project is Ready to Move. */
export const GST_RATE_READY_TO_MOVE = 0
/** GST rate (as a fraction) applied for any other / indeterminate status. */
export const GST_RATE_DEFAULT = 0.05

/**
 * Resolve the GST rate (as a fraction, e.g. `0.05` for 5%) for a project's
 * status. The function is TOTAL over every possible input: Under Construction
 * yields 5%, Ready to Move yields 0%, and every other value (including unknown
 * strings) yields the 5% default so the rate is always determinate.
 *
 * Requirements: 3.6, 3.7, 3.8 (Property 15).
 */
export function gstRateForProject(projectStatus: ProjectStatus | string): number {
    switch (projectStatus) {
        case 'UnderConstruction':
            return GST_RATE_UNDER_CONSTRUCTION
        case 'ReadyToMove':
            return GST_RATE_READY_TO_MOVE
        default:
            return GST_RATE_DEFAULT
    }
}

// ---------------------------------------------------------------------------
// Stamp duty (Req 3.5 / Property 14)
// ---------------------------------------------------------------------------

/**
 * Maharashtra stamp-duty rate (as a fraction). Used as the platform default
 * whenever no rate is configured for a given state (assumption A6).
 */
export const MAHARASHTRA_STAMP_DUTY_RATE = 0.06

/**
 * Seed table of state-wise stamp-duty rates (as fractions). Maharashtra is
 * always present; other states are seeded with representative defaults and may
 * be overridden at the call site via the `rates` argument so the table stays
 * configurable per assumption A6. Keys are matched case-insensitively.
 */
export const STAMP_DUTY_RATES: Readonly<Record<string, number>> = Object.freeze({
    maharashtra: MAHARASHTRA_STAMP_DUTY_RATE,
    karnataka: 0.056,
    delhi: 0.06,
    gujarat: 0.049,
    'tamil nadu': 0.07,
    telangana: 0.075,
    'uttar pradesh': 0.07,
    'west bengal': 0.06,
    rajasthan: 0.06,
    haryana: 0.07,
})

/**
 * Resolve the stamp-duty rate for a state, falling back to the Maharashtra
 * default when the state is unknown or has no configured rate.
 *
 * @param state  Project state name (matched case-insensitively, trimmed).
 * @param rates  Optional override table of state→rate (assumption A6).
 */
export function stampDutyRateForState(
    state: string,
    rates: Record<string, number> = STAMP_DUTY_RATES
): number {
    const key = typeof state === 'string' ? state.trim().toLowerCase() : ''
    const rate = rates[key]
    return typeof rate === 'number' && Number.isFinite(rate) ? rate : MAHARASHTRA_STAMP_DUTY_RATE
}

/**
 * Compute stamp duty for a base amount given the project's state. Equals
 * `base × rate`, where `rate` is the configured rate for that state when
 * present and the Maharashtra default rate otherwise (Property 14). The result
 * is rounded to 2 dp and validated to the money range.
 *
 * Requirements: 3.5, 10.3.
 *
 * @throws if `baseAmount` is out of the money range or the result overflows it.
 */
export function computeStampDuty(
    state: string,
    baseAmount: number,
    rates: Record<string, number> = STAMP_DUTY_RATES
): number {
    assertMoneyRange(baseAmount)
    const rate = stampDutyRateForState(state, rates)
    return assertMoneyRange(roundMoney(baseAmount * rate))
}

// ---------------------------------------------------------------------------
// Net payable & discount (Req 3.3, 3.4 / Properties 12, 13)
// ---------------------------------------------------------------------------

/** Sum a list of add-on charges, validating each is within the money range. */
function sumAddons(addons: number[]): number {
    let sum = 0
    for (const addon of addons) {
        assertMoneyRange(addon)
        sum += addon
    }
    return roundMoney(sum)
}

/**
 * Compute the gross amount of a cost sheet: `total + Σ(add-ons)`.
 * Add-ons are the additional charges (floor rise, view premium, parking,
 * clubhouse, legal, stamp duty, GST, registration, ...).
 *
 * @throws if any input or the result is out of the money range.
 */
export function computeGross(total: number, addons: number[] = []): number {
    assertMoneyRange(total)
    const gross = roundMoney(total + sumAddons(addons))
    return assertMoneyRange(gross)
}

/**
 * Validate a discount against the gross amount. Returns `true` when the
 * discount is acceptable (`0 ≤ discount ≤ gross`) and `false` when it exceeds
 * the gross — in which case the cost sheet must be rejected so that net payable
 * can never be negative (Property 13).
 *
 * Requirements: 3.4.
 */
export function validateDiscount(gross: number, discount: number): boolean {
    if (typeof gross !== 'number' || !Number.isFinite(gross)) return false
    if (typeof discount !== 'number' || !Number.isFinite(discount)) return false
    if (discount < 0) return false
    return roundMoney(discount) <= roundMoney(gross)
}

/**
 * Compute net payable: `total + Σ(add-ons) − discount` (Property 12), rounded
 * to 2 dp. Rejects discounts that exceed the gross amount so net payable is
 * never negative (Property 13).
 *
 * Requirements: 3.3, 3.4.
 *
 * @throws if any input is out of the money range or the discount exceeds gross.
 */
export function computeNetPayable(total: number, addons: number[] = [], discount = 0): number {
    const gross = computeGross(total, addons)
    assertMoneyRange(discount)
    if (!validateDiscount(gross, discount)) {
        throw new Error(
            `Discount ${discount} exceeds gross amount ${gross}; net payable cannot be negative`
        )
    }
    return assertMoneyRange(roundMoney(gross - discount))
}

// ---------------------------------------------------------------------------
// Milestone split (Req 3.11, 5.5 / Property 16)
// ---------------------------------------------------------------------------

/** A milestone definition within a payment plan. */
export interface PlanMilestone {
    name: string
    /** Days from the basis date when this milestone is due. */
    dueOffsetDays: number
    /** Percentage (0–100) of the basis amount allocated to this milestone. */
    percentage: number
}

/** A payment plan as stored in `PaymentPlan.milestones` (Json). */
export interface PaymentPlanInput {
    name?: string
    milestones: PlanMilestone[]
}

/** A milestone with a concrete monetary amount allocated to it. */
export interface SplitMilestone {
    name: string
    dueOffsetDays: number
    amount: number
}

/**
 * Split a basis amount (cost-sheet net payable for schedules, or booking
 * agreement value for bookings) across a payment plan's milestones according to
 * each milestone's percentage. Each amount is rounded to 2 dp, and any rounding
 * remainder is absorbed by the final milestone so that the sum of milestone
 * amounts equals the basis amount EXACTLY (Property 16).
 *
 * Requirements: 3.11, 5.5.
 *
 * @throws if `basisAmount` is out of the money range or the plan has no
 *         milestones (an empty plan cannot represent a non-trivial basis).
 */
export function splitMilestones(plan: PaymentPlanInput, basisAmount: number): SplitMilestone[] {
    assertMoneyRange(basisAmount)

    const milestones = plan?.milestones ?? []
    if (milestones.length === 0) {
        throw new Error('splitMilestones requires a payment plan with at least one milestone')
    }

    const basis = roundMoney(basisAmount)
    const result: SplitMilestone[] = []
    let allocated = 0

    for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i]
        const isLast = i === milestones.length - 1

        let amount: number
        if (isLast) {
            // The final milestone absorbs the rounding remainder so the sum is
            // exactly the basis amount, regardless of percentage rounding.
            amount = roundMoney(basis - allocated)
        } else {
            const pct = Number(milestone.percentage)
            const safePct = Number.isFinite(pct) ? pct : 0
            amount = roundMoney((basis * safePct) / 100)
            allocated = roundMoney(allocated + amount)
        }

        result.push({
            name: milestone.name,
            dueOffsetDays: Number(milestone.dueOffsetDays) || 0,
            amount,
        })
    }

    return result
}
