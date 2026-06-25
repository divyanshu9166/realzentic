'use client'

/**
 * Dynamic CMA tool — derive a data-backed price band from comparable units.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Scale, Loader2, Copy, Check } from 'lucide-react'
import { generateCma, type CmaResult } from '@/app/actions/cma'
import { listProjects } from '@/app/actions/properties'

const UNIT_TYPES = ['BHK1', 'BHK2', 'BHK3', 'BHK4', 'Shop', 'Office', 'Plot']
const TYPE_LABELS: Record<string, string> = {
    BHK1: '1 BHK', BHK2: '2 BHK', BHK3: '3 BHK', BHK4: '4 BHK', Shop: 'Shop', Office: 'Office', Plot: 'Plot',
}

function formatINR(amount: number): string {
    if (!Number.isFinite(amount) || amount === 0) return '—'
    if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`
    if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(1)} L`
    return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

export default function CmaClient() {
    const [type, setType] = useState('BHK2')
    const [carpetArea, setCarpetArea] = useState('800')
    const [city, setCity] = useState('')
    const [projectId, setProjectId] = useState('')
    const [projects, setProjects] = useState<Array<{ id: number; name: string; city: string }>>([])
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<CmaResult | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        listProjects().then((r) => {
            if (r.success) setProjects(r.data.map((p: { id: number; name: string; city: string }) => ({ id: p.id, name: p.name, city: p.city })))
        })
    }, [])

    async function handleRun() {
        const ca = Number(carpetArea)
        if (!ca || ca <= 0) { toast.error('Enter a valid carpet area'); return }
        setLoading(true)
        try {
            const res = await generateCma({
                type,
                carpetArea: ca,
                city: city.trim() || undefined,
                projectId: projectId ? Number(projectId) : undefined,
            })
            if (!res.success) { toast.error(res.error); return }
            setResult(res.data)
            if (res.data.comparableCount === 0) toast.info('No comparable units found — widen the scope or add inventory.')
        } finally {
            setLoading(false)
        }
    }

    async function copySummary() {
        if (!result) return
        const text =
            `CMA — ${TYPE_LABELS[result.subject.type] ?? result.subject.type}, ${result.subject.carpetArea} sq.ft.` +
            `${result.subject.city ? ` (${result.subject.city})` : ''}\n` +
            `Based on ${result.comparableCount} comparable units.\n` +
            `Price/sqft: ${result.pricePerSqft.min}–${result.pricePerSqft.max} (avg ${result.pricePerSqft.avg}).\n` +
            `Suggested price: ${formatINR(result.suggested.low)} – ${formatINR(result.suggested.high)} (mid ${formatINR(result.suggested.mid)}).`
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
            toast.success('CMA summary copied')
        } catch {
            toast.error('Could not copy')
        }
    }

    return (
        <div className="space-y-5 max-w-4xl">
            <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10"><Scale className="size-5 text-accent" /></div>
                <div>
                    <h1 className="text-xl font-bold text-foreground">Dynamic CMA — Pricing</h1>
                    <p className="text-sm text-muted">Derive a data-backed price band from comparable units in your inventory.</p>
                </div>
            </div>

            <div className="glass-card p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <label className="block text-xs text-muted mb-1">Configuration</label>
                        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm">
                            {UNIT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-muted mb-1">Carpet Area (sq.ft.)</label>
                        <input type="number" min="1" value={carpetArea} onChange={(e) => setCarpetArea(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs text-muted mb-1">City (optional)</label>
                        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g., Pune" className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs text-muted mb-1">Project (optional)</label>
                        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm">
                            <option value="">Any project</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end mt-3">
                    <button onClick={handleRun} disabled={loading} className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                        {loading ? <><Loader2 className="size-4 animate-spin inline" /> Analyzing…</> : 'Run CMA'}
                    </button>
                </div>
            </div>

            {result && result.comparableCount > 0 && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="glass-card p-4">
                            <p className="text-xs text-muted">Comparables</p>
                            <p className="text-xl font-bold text-foreground">{result.comparableCount}</p>
                        </div>
                        <div className="glass-card p-4">
                            <p className="text-xs text-muted">Avg ₹/sqft</p>
                            <p className="text-xl font-bold text-accent">₹{result.pricePerSqft.avg.toLocaleString('en-IN')}</p>
                            <p className="text-[11px] text-muted">range ₹{result.pricePerSqft.min.toLocaleString('en-IN')}–₹{result.pricePerSqft.max.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="glass-card p-4">
                            <p className="text-xs text-muted">Suggested (mid)</p>
                            <p className="text-xl font-bold text-emerald-600">{formatINR(result.suggested.mid)}</p>
                        </div>
                        <div className="glass-card p-4">
                            <p className="text-xs text-muted">Suggested Range</p>
                            <p className="text-sm font-bold text-foreground">{formatINR(result.suggested.low)} – {formatINR(result.suggested.high)}</p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button onClick={copySummary} className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent/80">
                            {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy summary</>}
                        </button>
                    </div>

                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="crm-table">
                                <thead>
                                    <tr>
                                        <th>Project</th>
                                        <th>Unit</th>
                                        <th>City</th>
                                        <th>Carpet</th>
                                        <th>Price</th>
                                        <th>₹/sqft</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.comparables.map((c) => (
                                        <tr key={c.unitId}>
                                            <td className="text-foreground">{c.projectName}</td>
                                            <td className="text-muted">{c.unitNumber}</td>
                                            <td className="text-muted">{c.city}</td>
                                            <td className="text-muted">{c.carpetArea} sqft</td>
                                            <td className="text-foreground">{formatINR(c.totalPrice)}</td>
                                            <td className="text-accent font-medium">₹{c.pricePerSqft.toLocaleString('en-IN')}</td>
                                            <td><span className="px-2 py-0.5 rounded-full text-xs bg-surface border border-border">{c.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {result && result.comparableCount === 0 && (
                <div className="glass-card p-6 text-center text-sm text-muted">
                    No comparable units found for this configuration. Try widening the area range, removing the city/project filter, or adding more inventory.
                </div>
            )}
        </div>
    )
}
