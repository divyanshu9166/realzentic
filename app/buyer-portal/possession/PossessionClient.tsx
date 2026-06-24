'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    raisePossessionSnag,
    signOffPossession,
    type BuyerPossessionChecklist,
    type ChecklistItem,
} from '@/app/actions/buyer-portal'
import { card, input, badge, primaryButton, secondaryButton, errorText, muted } from '../_components/styles'

const STATUS_COLORS: Record<ChecklistItem['status'], { bg: string; color: string }> = {
    OK: { bg: '#dcfce7', color: '#166534' },
    Snag: { bg: '#fee2e2', color: '#b91c1c' },
    Pending: { bg: '#f3f4f6', color: '#374151' },
}

/**
 * Interactive possession checklist for a single booking (Req 18.10).
 *
 * Renders the checklist items, lets the buyer raise a snag against an existing
 * item or as a new line (`raisePossessionSnag`), and records the buyer's
 * sign-off (`signOffPossession`). Both actions are scoped to the buyer's own
 * booking server-side (Req 18.6); a signed-off checklist is locked from further
 * snags, so the snag controls are hidden once `buyerSigned` is true.
 */
export function PossessionClient({
    bookingId,
    label,
    checklist,
}: {
    bookingId: number
    label: string
    checklist: BuyerPossessionChecklist
}) {
    const router = useRouter()
    const [snagItemId, setSnagItemId] = useState('')
    const [snagLabel, setSnagLabel] = useState('')
    const [note, setNote] = useState('')
    const [signatureUrl, setSignatureUrl] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function submitSnag(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
            const res = await raisePossessionSnag(bookingId, {
                itemId: snagItemId === '' ? undefined : snagItemId,
                label: snagLabel.trim() === '' ? undefined : snagLabel,
                note,
            })
            if (!res.success) {
                setError(res.error)
                return
            }
            setSnagItemId('')
            setSnagLabel('')
            setNote('')
            router.refresh()
        })
    }

    function signOff() {
        setError(null)
        startTransition(async () => {
            const res = await signOffPossession(bookingId, {
                signatureUrl: signatureUrl.trim() === '' ? null : signatureUrl,
            })
            if (!res.success) {
                setError(res.error)
                return
            }
            router.refresh()
        })
    }

    return (
        <li style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{label}</strong>
                {checklist.buyerSigned ? (
                    <span style={{ ...badge, background: '#dcfce7', color: '#166534' }}>Signed off</span>
                ) : (
                    <span style={badge}>Awaiting sign-off</span>
                )}
            </div>

            <div style={{ ...muted, marginTop: 4 }}>
                {checklist.inspectionDate
                    ? `Inspected ${new Date(checklist.inspectionDate).toLocaleDateString()}`
                    : 'Inspection pending'}
                {checklist.inspector ? ` · ${checklist.inspector}` : ''}
                {checklist.handoverDate
                    ? ` · Handover ${new Date(checklist.handoverDate).toLocaleDateString()}`
                    : ''}
                {checklist.keysHanded ? ' · Keys handed over' : ''}
            </div>

            {checklist.items.length === 0 ? (
                <p style={{ ...muted, marginTop: 12 }}>No checklist items yet.</p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0, marginTop: 12, display: 'grid', gap: 8 }}>
                    {checklist.items.map((item) => {
                        const colors = STATUS_COLORS[item.status]
                        return (
                            <li
                                key={item.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    padding: '8px 10px',
                                    border: '1px solid #f1f5f9',
                                    borderRadius: 8,
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</div>
                                    {item.snagNote ? (
                                        <div style={{ ...muted, marginTop: 2 }}>Snag: {item.snagNote}</div>
                                    ) : null}
                                </div>
                                <span style={{ ...badge, background: colors.bg, color: colors.color, height: 'fit-content' }}>
                                    {item.status}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}

            {checklist.buyerSigned ? (
                <p style={{ ...muted, marginTop: 12 }}>
                    This checklist has been signed off and can no longer be changed.
                    {checklist.signatureUrl ? (
                        <>
                            {' '}
                            <a
                                href={checklist.signatureUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#2563eb' }}
                            >
                                View signature
                            </a>
                        </>
                    ) : null}
                </p>
            ) : (
                <>
                    <form onSubmit={submitSnag} style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Raise a snag</div>
                        {checklist.items.length > 0 ? (
                            <select
                                value={snagItemId}
                                onChange={(e) => setSnagItemId(e.target.value)}
                                style={input}
                            >
                                <option value="">New snag item</option>
                                {checklist.items.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        Flag: {item.label}
                                    </option>
                                ))}
                            </select>
                        ) : null}
                        {snagItemId === '' ? (
                            <input
                                value={snagLabel}
                                onChange={(e) => setSnagLabel(e.target.value)}
                                placeholder="Snag item label (e.g. Kitchen tap leak)"
                                style={input}
                            />
                        ) : null}
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            required
                            rows={2}
                            placeholder="Describe the defect"
                            style={{ ...input, resize: 'vertical' }}
                        />
                        <button type="submit" disabled={pending} style={secondaryButton}>
                            {pending ? 'Saving…' : 'Raise snag'}
                        </button>
                    </form>

                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Sign off possession</div>
                        <input
                            value={signatureUrl}
                            onChange={(e) => setSignatureUrl(e.target.value)}
                            placeholder="Signature image URL (optional)"
                            style={input}
                        />
                        <button type="button" onClick={signOff} disabled={pending} style={primaryButton}>
                            {pending ? 'Signing…' : 'Sign off & accept possession'}
                        </button>
                    </div>
                </>
            )}

            {error && <p style={errorText}>{error}</p>}
        </li>
    )
}
