'use client'

/**
 * India finance calculators hub — bundles the calculators buyers usually
 * Google mid-funnel, inside the CRM:
 *   1. Stamp Duty + Registration (state-wise)
 *   2. Home Loan EMI + Eligibility (+ bank-rate comparison)
 *   3. Rental Yield + Appreciation (investor metrics)
 *   4. GST on under-construction purchase
 *
 * All math reuses the tested pure helpers in lib/* (no server round-trip).
 */

import { useMemo, useState } from 'react'
import { Landmark, Home, TrendingUp, Receipt, Percent } from 'lucide-react'
import { stampDutyRateForState, STAMP_DUTY_RATES, gstRateForProject } from '@/lib/cost-sheet'
import { computeEmi, totalInterest, validateDownPayment, estimateStampDutyAndRegistration } from '@/lib/emi'
import { loanEligibility, rentalYield, appreciationProjection, gstAmount } from '@/lib/finance-calculators'

const TABS = [
    { id: 'stamp', label: 'Stamp Duty', Icon: Landmark },
    { id: 'loan', label: 'Home Loan', Icon: Home },
    { id: 'invest', label: 'Yield & Growth', Icon: TrendingUp },
    { id: 'gst', label: 'GST', Icon: Receipt },
] as const
type TabId = (typeof TABS)[number]['id']

const STATE_LABELS: Record<string, string> = {
    maharashtra: 'Maharashtra', karnataka: 'Karnataka', delhi: 'Delhi', gujarat: 'Gujarat',
    'tamil nadu': 'Tamil Nadu', telangana: 'Telangana', 'uttar pradesh': 'Uttar Pradesh',
    'west bengal': 'West Bengal', rajasthan: 'Rajasthan', haryana: 'Haryana',
}

// Indicative published home-loan rates (editable in UI; live rates require a paid feed).
const BANK_RATES: Array<{ bank: string; rate: number }> = [
    { bank: 'SBI', rate: 8.5 }, { bank: 'HDFC', rate: 8.7 }, { bank: 'ICICI', rate: 8.75 },
    { bank: 'Axis', rate: 8.85 }, { bank: 'Kotak', rate: 8.7 }, { bank: 'PNB', rate: 8.6 },
]

function formatINR(amount: number): string {
    if (!Number.isFinite(amount) || amount === 0) return '₹0'
    if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`
    if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`
    return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

function Field({ label, value, onChange, type = 'number', placeholder }: {
    label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
    return (
        <div>
            <label className="block text-xs text-muted mb-1">{label}</label>
            <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm" />
        </div>
    )
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
    return (
        <div className="glass-card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className={`text-lg font-bold ${tint ?? 'text-foreground'}`}>{value}</p>
        </div>
    )
}

export default function CalculatorsClient() {
    const [tab, setTab] = useState<TabId>('stamp')

    // 1. Stamp duty
    const [sdState, setSdState] = useState('maharashtra')
    const [sdValue, setSdValue] = useState('5000000')
    const stamp = useMemo(() => {
        const base = Number(sdValue)
        if (!base || base <= 0 || base > 999_999_999) return null
        try {
            const r = estimateStampDutyAndRegistration(sdState, base)
            return { ...r, ratePct: (stampDutyRateForState(sdState) * 100).toFixed(2) }
        } catch { return null }
    }, [sdState, sdValue])

    // 2. Home loan
    const [pValue, setPValue] = useState('5000000')
    const [down, setDown] = useState('1000000')
    const [rate, setRate] = useState('8.5')
    const [years, setYears] = useState('20')
    const loan = useMemo(() => {
        const value = Number(pValue), dp = Number(down), r = Number(rate), n = Number(years) * 12
        if (!value || value <= 0 || value > 999_999_999) return null
        if (!validateDownPayment(value, dp)) return null
        if (!Number.isFinite(r) || r < 0 || !Number.isInteger(n) || n < 1) return null
        try {
            const principal = value - dp
            const emi = computeEmi(principal, r, n)
            const interest = totalInterest(principal, r, n)
            return { principal, emi, interest, total: principal + interest }
        } catch { return null }
    }, [pValue, down, rate, years])
    const bankEmis = useMemo(() => {
        const value = Number(pValue), dp = Number(down), n = Number(years) * 12
        if (!validateDownPayment(value, dp) || !Number.isInteger(n) || n < 1) return []
        const principal = value - dp
        return BANK_RATES.map((b) => {
            try { return { ...b, emi: computeEmi(principal, b.rate, n) } } catch { return { ...b, emi: 0 } }
        })
    }, [pValue, down, years])

    // Eligibility
    const [income, setIncome] = useState('100000')
    const [obligations, setObligations] = useState('0')
    const elig = useMemo(() => loanEligibility({
        monthlyIncome: Number(income), monthlyObligations: Number(obligations),
        annualRatePct: Number(rate) || 8.5, tenureMonths: (Number(years) || 20) * 12,
    }), [income, obligations, rate, years])

    // 3. Yield & appreciation
    const [ryValue, setRyValue] = useState('8000000')
    const [rent, setRent] = useState('25000')
    const [expenses, setExpenses] = useState('30000')
    const ry = useMemo(() => rentalYield({ propertyValue: Number(ryValue), monthlyRent: Number(rent), annualExpenses: Number(expenses) }), [ryValue, rent, expenses])
    const [growth, setGrowth] = useState('8')
    const [appYears, setAppYears] = useState('5')
    const app = useMemo(() => appreciationProjection({ currentValue: Number(ryValue), annualGrowthPct: Number(growth), years: Number(appYears) }), [ryValue, growth, appYears])

    // 4. GST
    const [gstBase, setGstBase] = useState('5000000')
    const [gstStatus, setGstStatus] = useState('UnderConstruction')
    const gst = useMemo(() => {
        const base = Number(gstBase)
        const r = gstRateForProject(gstStatus)
        return { rate: r, amount: gstAmount(base, r), total: base + gstAmount(base, r) }
    }, [gstBase, gstStatus])

    return (
        <div className="space-y-5 max-w-4xl">
            <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10"><Percent className="size-5 text-accent" /></div>
                <div>
                    <h1 className="text-xl font-bold text-foreground">Property Finance Calculators</h1>
                    <p className="text-sm text-muted">Stamp duty, home loan, rental yield, appreciation and GST — all in one place.</p>
                </div>
            </div>

            <div className="flex bg-surface rounded-xl border border-border p-0.5 w-fit overflow-x-auto">
                {TABS.map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${tab === id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
                        <Icon className="size-3.5" /> {label}
                    </button>
                ))}
            </div>

            {/* 1. Stamp duty */}
            {tab === 'stamp' && (
                <div className="space-y-4">
                    <div className="glass-card p-5 grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs text-muted mb-1">State</label>
                            <select value={sdState} onChange={(e) => setSdState(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm">
                                {Object.keys(STAMP_DUTY_RATES).map((k) => <option key={k} value={k}>{STATE_LABELS[k] ?? k}</option>)}
                            </select>
                        </div>
                        <Field label="Property / Agreement Value (₹)" value={sdValue} onChange={setSdValue} />
                    </div>
                    {stamp && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <Stat label={`Stamp Duty (${stamp.ratePct}%)`} value={formatINR(stamp.stampDuty)} tint="text-accent" />
                            <Stat label="Registration (1%)" value={formatINR(stamp.registration)} />
                            <Stat label="Total Charges" value={formatINR(stamp.total)} tint="text-emerald-600" />
                            <Stat label="All-in Cost" value={formatINR(Number(sdValue) + stamp.total)} />
                        </div>
                    )}
                </div>
            )}

            {/* 2. Home loan */}
            {tab === 'loan' && (
                <div className="space-y-4">
                    <div className="glass-card p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Property Value (₹)" value={pValue} onChange={setPValue} />
                        <Field label="Down Payment (₹)" value={down} onChange={setDown} />
                        <Field label="Interest Rate (%)" value={rate} onChange={setRate} />
                        <Field label="Tenure (years)" value={years} onChange={setYears} />
                    </div>
                    {loan ? (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <Stat label="Loan Amount" value={formatINR(loan.principal)} />
                                <Stat label="Monthly EMI" value={formatINR(loan.emi)} tint="text-accent" />
                                <Stat label="Total Interest" value={formatINR(loan.interest)} tint="text-amber-600" />
                                <Stat label="Total Payment" value={formatINR(loan.total)} />
                            </div>
                            <div className="glass-card overflow-hidden">
                                <div className="px-4 py-2 text-xs font-semibold text-muted border-b border-border">Bank Rate Comparison (indicative) — EMI on {formatINR(loan.principal)} over {years} yrs</div>
                                <div className="overflow-x-auto">
                                    <table className="crm-table">
                                        <thead><tr><th>Bank</th><th>Rate</th><th>Monthly EMI</th></tr></thead>
                                        <tbody>
                                            {bankEmis.map((b) => (
                                                <tr key={b.bank}><td className="text-foreground">{b.bank}</td><td className="text-muted">{b.rate}%</td><td className="text-accent font-medium">{formatINR(b.emi)}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="px-4 py-2 text-[11px] text-muted">Rates are indicative; confirm live rates with the lender (live-rate feeds require a paid data source).</p>
                            </div>
                        </>
                    ) : (
                        <p className="glass-card p-4 text-sm text-muted">Enter a valid property value with a down payment below it.</p>
                    )}

                    <div className="glass-card p-5 space-y-3">
                        <h2 className="text-sm font-semibold text-foreground">Loan Eligibility (FOIR 50%)</h2>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Monthly Income (₹)" value={income} onChange={setIncome} />
                            <Field label="Existing EMIs / Obligations (₹)" value={obligations} onChange={setObligations} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Stat label="Max Affordable EMI" value={formatINR(elig.maxEmi)} />
                            <Stat label="Eligible Loan" value={formatINR(elig.eligibleLoan)} tint="text-emerald-600" />
                        </div>
                        <p className="text-[11px] text-muted">Eligible loan at {rate || 8.5}% for {years || 20} years.</p>
                    </div>
                </div>
            )}

            {/* 3. Yield & appreciation */}
            {tab === 'invest' && (
                <div className="space-y-4">
                    <div className="glass-card p-5 space-y-3">
                        <h2 className="text-sm font-semibold text-foreground">Rental Yield</h2>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Property Value (₹)" value={ryValue} onChange={setRyValue} />
                            <Field label="Monthly Rent (₹)" value={rent} onChange={setRent} />
                            <Field label="Annual Expenses (₹)" value={expenses} onChange={setExpenses} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <Stat label="Annual Rent" value={formatINR(ry.annualRent)} />
                            <Stat label="Gross Yield" value={`${ry.grossYieldPct}%`} tint="text-accent" />
                            <Stat label="Net Yield" value={`${ry.netYieldPct}%`} tint="text-emerald-600" />
                        </div>
                    </div>

                    <div className="glass-card p-5 space-y-3">
                        <h2 className="text-sm font-semibold text-foreground">Appreciation Projection</h2>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Current Value (₹)" value={ryValue} onChange={setRyValue} />
                            <Field label="Annual Growth (%)" value={growth} onChange={setGrowth} />
                            <Field label="Years" value={appYears} onChange={setAppYears} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Stat label={`Value after ${appYears || 0} yrs`} value={formatINR(app.futureValue)} tint="text-accent" />
                            <Stat label="Total Gain" value={formatINR(app.totalGain)} tint="text-emerald-600" />
                        </div>
                        {app.schedule.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                                {app.schedule.map((s) => (
                                    <span key={s.year} className="px-2 py-0.5 rounded-full text-xs bg-surface border border-border text-muted">Y{s.year}: <span className="text-foreground font-medium">{formatINR(s.value)}</span></span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 4. GST */}
            {tab === 'gst' && (
                <div className="space-y-4">
                    <div className="glass-card p-5 grid gap-3 sm:grid-cols-2">
                        <Field label="Base Value (₹)" value={gstBase} onChange={setGstBase} />
                        <div>
                            <label className="block text-xs text-muted mb-1">Project Status</label>
                            <select value={gstStatus} onChange={(e) => setGstStatus(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm">
                                <option value="UnderConstruction">Under Construction (5% GST)</option>
                                <option value="ReadyToMove">Ready to Move (0% GST)</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <Stat label="GST Rate" value={`${(gst.rate * 100).toFixed(0)}%`} />
                        <Stat label="GST Amount" value={formatINR(gst.amount)} tint="text-accent" />
                        <Stat label="Total with GST" value={formatINR(gst.total)} tint="text-emerald-600" />
                    </div>
                    <p className="text-[11px] text-muted">Under-construction residential attracts 5% GST (no input tax credit); ready-to-move (with completion certificate) is GST-exempt.</p>
                </div>
            )}
        </div>
    )
}
