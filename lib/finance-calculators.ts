/**
 * India finance calculators — additional PURE helpers.
 *
 * Complements the existing tested math (`computeEmi`, `amortizationSchedule`,
 * `computeStampDuty`/`estimateStampDutyAndRegistration`, `gstRateForProject`)
 * with the two pieces the CRM did not yet have: home-loan eligibility (FOIR
 * based) and investor metrics (rental yield + appreciation projection).
 *
 * All functions are pure and deterministic; invalid/non-finite inputs degrade
 * to safe zeros rather than throwing, so they are convenient to drive directly
 * from form fields.
 */

/** Round to 2 decimal places. */
function round2(n: number): number {
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function num(n: unknown): number {
    return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n))
}

// ─── Home-loan eligibility (FOIR) ─────────────────────────────────────────────

export interface LoanEligibilityInput {
    /** Gross monthly income. */
    monthlyIncome: number
    /** Existing monthly EMIs / obligations (default 0). */
    monthlyObligations?: number
    /** Annual interest rate in percent. */
    annualRatePct: number
    /** Tenure in months. */
    tenureMonths: number
    /** Fixed-obligation-to-income ratio cap as a fraction (default 0.5 = 50%). */
    foir?: number
}

export interface LoanEligibilityResult {
    /** Maximum EMI the applicant can service. */
    maxEmi: number
    /** Maximum loan principal that EMI supports at the given rate/tenure. */
    eligibleLoan: number
}

/**
 * Estimate home-loan eligibility using the FOIR method: the bank caps total
 * obligations at `foir × income`, so the affordable EMI is
 * `income × foir − existing obligations`. That EMI is then reverse-amortized
 * into the maximum supportable principal at the given rate and tenure.
 */
export function loanEligibility(input: LoanEligibilityInput): LoanEligibilityResult {
    const income = num(input.monthlyIncome)
    const obligations = num(input.monthlyObligations)
    const foir = clamp(num(input.foir) || 0.5, 0, 1)
    const tenure = Math.max(0, Math.trunc(num(input.tenureMonths)))
    const r = num(input.annualRatePct) / 12 / 100

    const maxEmi = round2(Math.max(0, income * foir - obligations))
    if (maxEmi <= 0 || tenure <= 0) return { maxEmi, eligibleLoan: 0 }

    let eligibleLoan: number
    if (r === 0) {
        eligibleLoan = maxEmi * tenure
    } else {
        const g = Math.pow(1 + r, tenure)
        eligibleLoan = (maxEmi * (g - 1)) / (r * g)
    }
    return { maxEmi, eligibleLoan: round2(eligibleLoan) }
}

// ─── Rental yield ─────────────────────────────────────────────────────────────

export interface RentalYieldInput {
    propertyValue: number
    monthlyRent: number
    /** Annual ownership costs (maintenance, tax, etc.) — default 0. */
    annualExpenses?: number
}

export interface RentalYieldResult {
    annualRent: number
    grossYieldPct: number
    netYieldPct: number
}

/**
 * Rental yield: gross = annual rent / property value; net subtracts annual
 * ownership expenses from the annual rent before dividing.
 */
export function rentalYield(input: RentalYieldInput): RentalYieldResult {
    const value = num(input.propertyValue)
    const annualRent = num(input.monthlyRent) * 12
    const expenses = num(input.annualExpenses)
    const gross = value > 0 ? (annualRent / value) * 100 : 0
    const net = value > 0 ? ((annualRent - expenses) / value) * 100 : 0
    return { annualRent: round2(annualRent), grossYieldPct: round2(gross), netYieldPct: round2(net) }
}

// ─── Appreciation projection ───────────────────────────────────────────────────

export interface AppreciationInput {
    currentValue: number
    annualGrowthPct: number
    years: number
}

export interface AppreciationResult {
    futureValue: number
    totalGain: number
    schedule: Array<{ year: number; value: number }>
}

/**
 * Compound a property's value forward at a constant annual growth rate and
 * return the year-by-year projected value, the final value and the total gain.
 */
export function appreciationProjection(input: AppreciationInput): AppreciationResult {
    const current = num(input.currentValue)
    const g = num(input.annualGrowthPct) / 100
    const years = clamp(Math.trunc(num(input.years)), 0, 50)

    const schedule: Array<{ year: number; value: number }> = []
    for (let y = 1; y <= years; y++) {
        schedule.push({ year: y, value: round2(current * Math.pow(1 + g, y)) })
    }
    const futureValue = round2(current * Math.pow(1 + g, years))
    return { futureValue, totalGain: round2(futureValue - current), schedule }
}

// ─── GST on under-construction purchase ─────────────────────────────────────────

/**
 * GST amount on a base value at a given fractional rate (e.g. 0.05). Pure
 * multiply + round; the rate itself comes from `gstRateForProject` in
 * `lib/cost-sheet.ts`.
 */
export function gstAmount(baseValue: number, rate: number): number {
    return round2(num(baseValue) * num(rate))
}
