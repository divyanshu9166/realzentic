/**
 * Referral program engine — pure helpers (no DB/IO).
 *
 * These functions back the Referral_Service (`app/actions/referrals.ts`,
 * design Module 16):
 *
 *   - {@link isSelfReferral} guards against a contact referring themselves; the
 *     action layer rejects such referrals with an error (Req 19.7).
 *   - {@link computeReward} resolves the reward amount/value from a
 *     `ReferralProgram` when a referred contact's deal reaches a won stage
 *     (Req 19.3).
 *
 * Monetary outputs share the platform-wide money/rounding semantics via
 * {@link roundMoney} so the reward amount persisted on a `Referral`
 * (`rewardAmount Decimal(12,2)`) is always rounded to two decimal places.
 *
 * Requirements: 19.3 (compute reward), 19.7 (reject self-referral).
 */

import type { Prisma } from '@prisma/client'
import { roundMoney } from './money'

/**
 * The set of reward types supported by `ReferralProgram.rewardType`
 * (stored as a `String` in `prisma/schema.prisma`: `Cash | Discount | Gift`).
 */
export type RewardType = 'Cash' | 'Discount' | 'Gift'

/**
 * A Prisma `Decimal`-compatible value. `ReferralProgram.rewardValue` is a
 * `Decimal(12,2)` column; depending on the call site it may arrive as a
 * `Prisma.Decimal`, a numeric string, or a plain number. Accepting all three
 * keeps this helper pure and usable from both server actions and tests.
 */
type DecimalLike = Prisma.Decimal | number | string

/**
 * Minimal `ReferralProgram` shape required to compute a reward, mirroring the
 * relevant fields of the Prisma model. Extra model fields are accepted and
 * ignored so a full program record can be passed directly.
 */
export interface ReferralProgramReward {
    /** `Cash`, `Discount`, or `Gift` (see {@link RewardType}). */
    rewardType: string
    /** The program's reward value (`Decimal(12,2)` in the schema). */
    rewardValue: DecimalLike
}

/**
 * Coerce a Prisma `Decimal`/string/number into a finite JavaScript number.
 *
 * @throws if the value cannot be parsed into a finite number.
 */
function toNumber(value: DecimalLike): number {
    const n = typeof value === 'number' ? value : Number(value.toString())
    if (!Number.isFinite(n)) {
        throw new Error(`Expected a finite numeric reward value, received: ${String(value)}`)
    }
    return n
}

/**
 * Determine whether a referral is a self-referral, i.e. the referrer and the
 * referred contact are the same contact.
 *
 * The action layer must reject such referrals (Req 19.7).
 *
 * @param referrerId The id of the referring contact.
 * @param referredId The id of the referred contact.
 * @returns `true` when the two ids identify the same contact.
 */
export function isSelfReferral(referrerId: number, referredId: number): boolean {
    return referrerId === referredId
}

/**
 * Compute the reward amount/value for a referral from its program.
 *
 * For every supported reward type the reward is derived from the program's
 * `rewardValue` (Req 19.3): `Cash` yields a payable amount, `Discount` yields a
 * discount value, and `Gift` yields the gift's monetary value. The result is
 * rounded to two decimal places via {@link roundMoney} to match the
 * `Referral.rewardAmount` `Decimal(12,2)` column.
 *
 * @param program A program (or program-shaped object) with `rewardType` and `rewardValue`.
 * @returns The reward, rounded to 2 decimal places.
 * @throws if `rewardType` is not one of `Cash | Discount | Gift`, or if
 *         `rewardValue` is not a finite number.
 */
export function computeReward(program: ReferralProgramReward): number {
    const value = toNumber(program.rewardValue)

    switch (program.rewardType as RewardType) {
        case 'Cash':
        case 'Discount':
        case 'Gift':
            return roundMoney(value)

        default:
            throw new Error(`Unsupported reward type: ${String(program.rewardType)}`)
    }
}
