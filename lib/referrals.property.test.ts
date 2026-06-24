/**
 * Property-based tests for the referral program pure helpers
 * ({@link computeReward} and {@link isSelfReferral} in `lib/referrals.ts`).
 *
 * Implements design Correctness Properties 67–68:
 *   - Property 67: Won referred deal computes reward (Req 19.3)
 *   - Property 68: Self-referral is rejected (Req 19.7)
 *
 * Tag convention (design.md → Testing Strategy → PBT):
 *   // Feature: real-estate-crm, Property N: <text>
 *
 * Runs at the project default of 100 iterations via `fcAssert`.
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { computeReward, isSelfReferral, type RewardType } from '@/lib/referrals'
import { roundMoney } from '@/lib/money'
import { fcAssert, moneyArb } from '@/test/generators'

/** The reward types supported by `ReferralProgram.rewardType`. */
const rewardTypeArb: fc.Arbitrary<RewardType> = fc.constantFrom(
    'Cash',
    'Discount',
    'Gift',
)

/**
 * A contact id: a positive integer in the id space used by the platform.
 * (Contacts are keyed by an autoincrement `Int` primary key.)
 */
const contactIdArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 1_000_000 })

describe('referral pure helpers', () => {
    // Feature: real-estate-crm, Property 67: Won referred deal computes reward
    // For any referral program, when a referred contact's deal reaches a won
    // stage the reward amount equals the reward computed from the program's
    // reward value (rounded to two decimal places).
    // Validates: Requirements 19.3
    describe('computeReward', () => {
        it('Property 67: reward equals round(program.rewardValue, 2) for every reward type', () => {
            fcAssert(
                fc.property(rewardTypeArb, moneyArb, (rewardType, rewardValue) => {
                    const expected = roundMoney(rewardValue)
                    expect(computeReward({ rewardType, rewardValue })).toBe(expected)
                }),
            )
        })

        it('Property 67: accepts numeric-string reward values equivalently', () => {
            fcAssert(
                fc.property(rewardTypeArb, moneyArb, (rewardType, rewardValue) => {
                    const expected = roundMoney(rewardValue)
                    expect(
                        computeReward({ rewardType, rewardValue: String(rewardValue) }),
                    ).toBe(expected)
                }),
            )
        })
    })

    // Feature: real-estate-crm, Property 68: Self-referral is rejected
    // For any referral whose referrer and referred contact are the same, the
    // self-referral guard reports the referral as a self-referral (so the
    // action layer rejects it); otherwise it is not flagged.
    // Validates: Requirements 19.7
    describe('isSelfReferral', () => {
        it('Property 68: flags a referral exactly when referrer and referred ids are equal', () => {
            fcAssert(
                fc.property(contactIdArb, contactIdArb, (referrerId, referredId) => {
                    expect(isSelfReferral(referrerId, referredId)).toBe(
                        referrerId === referredId,
                    )
                }),
            )
        })

        it('Property 68: any contact referring itself is always a self-referral', () => {
            fcAssert(
                fc.property(contactIdArb, (id) => {
                    expect(isSelfReferral(id, id)).toBe(true)
                }),
            )
        })
    })
})
