/**
 * Shared money helpers for the Real Estate CRM.
 *
 * Every monetary value in the platform is validated to the inclusive range
 * `0.00 … 999,999,999.99` and every derived monetary output is rounded to
 * two decimal places using round-half-up semantics. Centralizing these rules
 * here ensures every service (inventory pricing, cost sheets, commissions,
 * EMI, milestones) shares identical money semantics.
 *
 * Requirements: 20.4 (validate before write), and the money/rounding
 * convention referenced throughout the design.
 */

/** Inclusive minimum for any monetary value. */
export const MONEY_MIN = 0
/** Inclusive maximum for any monetary value (999,999,999.99). */
export const MONEY_MAX = 999_999_999.99

/**
 * Round a number to two decimal places using round-half-up
 * (ties are rounded away from zero, e.g. `1.005 -> 1.01`).
 *
 * Uses exponential-notation re-parsing to avoid binary floating-point
 * artifacts (e.g. `1.005 * 100` evaluating to `100.4999…`).
 *
 * @throws if `value` is not a finite number.
 */
export function roundMoney(value: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`roundMoney expects a finite number, received: ${String(value)}`)
    }

    const sign = value < 0 ? -1 : 1
    const abs = Math.abs(value)

    // Values below 1e-6 are formatted in exponential notation by the runtime
    // and always round to 0.00 at two decimal places, so short-circuit them.
    if (abs < 1e-6) return 0

    const rounded = Number(`${Math.round(Number(`${abs}e2`))}e-2`)
    const result = sign * rounded

    // Normalize negative zero to zero.
    return result === 0 ? 0 : result
}

/**
 * Assert that a value is a finite number within the monetary range
 * `MONEY_MIN … MONEY_MAX`. Returns the value unchanged when valid so it can
 * be used inline.
 *
 * @throws if `value` is not a finite number or is outside the allowed range.
 */
export function assertMoneyRange(value: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`assertMoneyRange expects a finite number, received: ${String(value)}`)
    }
    if (value < MONEY_MIN || value > MONEY_MAX) {
        throw new Error(
            `Money value ${value} is out of range (${MONEY_MIN.toFixed(2)}–${MONEY_MAX.toFixed(2)})`
        )
    }
    return value
}

/**
 * Non-throwing predicate variant of {@link assertMoneyRange}. Useful inside
 * validation layers (e.g. Zod `refine`) where a boolean is expected.
 */
export function isMoneyInRange(value: number): boolean {
    return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= MONEY_MIN &&
        value <= MONEY_MAX
    )
}
