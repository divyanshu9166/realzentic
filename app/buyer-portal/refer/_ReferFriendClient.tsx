'use client'

/**
 * Interactive "Refer a Friend" form for the buyer portal (Req 19.6).
 *
 * Allows the authenticated buyer to submit a referral by entering a friend's
 * contact ID (or phone, resolved on the server). The form calls
 * `createReferral` from `app/actions/referrals.ts` and shows a success or
 * error state. It also includes a "Copy link" button for the shareable
 * per-buyer invite URL (Req 19.5 / 19.6).
 *
 * Self-referral protection is enforced in `createReferral` (Req 19.7); the
 * client shows the server-returned error message directly.
 */

import { useState, useTransition } from 'react'
import { createReferral } from '@/app/actions/referrals'
import {
    card,
    h2,
    input,
    primaryButton,
    muted,
    errorText,
    successText,
} from '../_components/styles'

interface Props {
    /** The authenticated buyer's contact ID (scope for self-referral check). */
    contactId: number
    /** The active program to link the referral to. */
    programId: number
    /** Display name of the authenticated buyer, shown in the shareable link hint. */
    contactName?: string
}

export function ReferFriendClient({ contactId, programId, contactName }: Props) {
    const [referredId, setReferredId] = useState('')
    const [result, setResult] = useState<
        { ok: true } | { ok: false; error: string } | null
    >(null)
    const [isPending, startTransition] = useTransition()

    // Copy-link state
    const [copied, setCopied] = useState(false)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const idNum = parseInt(referredId.trim(), 10)
        if (!idNum || idNum <= 0) {
            setResult({ ok: false, error: 'Please enter a valid contact ID.' })
            return
        }
        setResult(null)

        startTransition(async () => {
            const res = await createReferral({
                referrerId: contactId,
                referredId: idNum,
                programId,
                status: 'Pending',
            })
            if (res.success) {
                setResult({ ok: true })
                setReferredId('')
            } else {
                setResult({ ok: false, error: res.error })
            }
        })
    }

    const handleCopyLink = () => {
        const origin = window.location.origin
        const link = `${origin}/buyer-portal/refer?ref=${programId}&from=${contactId}`
        navigator.clipboard.writeText(link).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
        })
    }

    return (
        <section style={card}>
            <h2 style={h2}>Submit a referral</h2>
            <p style={{ ...muted, marginBottom: 16 }}>
                Enter your friend&apos;s contact ID (share your invite link so they can
                share it back, or ask a sales agent for the contact ID).
            </p>

            <form onSubmit={handleSubmit}>
                <label
                    htmlFor="referredId"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
                >
                    Friend&apos;s Contact ID
                </label>
                <input
                    id="referredId"
                    type="number"
                    min="1"
                    placeholder="e.g. 42"
                    value={referredId}
                    onChange={(e) => setReferredId(e.target.value)}
                    style={input}
                    required
                />

                <button
                    type="submit"
                    disabled={isPending}
                    style={{ ...primaryButton, opacity: isPending ? 0.6 : 1 }}
                >
                    {isPending ? 'Submitting…' : 'Submit referral'}
                </button>
            </form>

            {result?.ok === true && (
                <p style={{ ...successText, marginTop: 12 }}>
                    Referral submitted! We&apos;ll track it and notify you when your friend
                    makes a purchase.
                </p>
            )}
            {result?.ok === false && (
                <p style={errorText}>{result.error}</p>
            )}

            {/* Shareable invite link copy button */}
            <div style={{ marginTop: 24, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                <p style={{ ...muted, marginBottom: 8 }}>
                    Or share your personal invite link:
                </p>
                <button
                    type="button"
                    onClick={handleCopyLink}
                    style={{
                        ...primaryButton,
                        background: copied ? '#16a34a' : '#2563eb',
                        fontSize: 14,
                        padding: '8px 16px',
                    }}
                >
                    {copied ? '✓ Link copied!' : '📋 Copy invite link'}
                </button>
                {contactName && (
                    <p style={{ ...muted, marginTop: 6 }}>
                        Sharing as: <strong style={{ color: '#374151' }}>{contactName}</strong>
                    </p>
                )}
            </div>
        </section>
    )
}
