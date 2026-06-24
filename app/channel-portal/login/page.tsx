'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loginChannelPartner } from '@/app/actions/channel-portal'

/**
 * Channel Partner portal login (Req 7.1, 7.2, 7.8, 21.1).
 *
 * Email + password sign-in, independent of the internal dashboard auth. Only
 * Active partners are granted access (Req 7.1); failed attempts are rate-limited
 * (5 per 15 minutes → 15-minute block, Req 7.2) by the server action. On success
 * the action sets the signed `cp_session` cookie and the page redirects to the
 * portal home. Unauthenticated partners are sent here by `requireChannelPartnerAuth`
 * (Req 7.8, 21.1).
 */
export default function ChannelPartnerLoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
            const res = await loginChannelPartner(email, password)
            if (!res.success) {
                setError(res.error)
                return
            }
            router.replace('/channel-portal')
            router.refresh()
        })
    }

    return (
        <div style={{ maxWidth: 380, margin: '64px auto', padding: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Channel Partner Portal</h1>
            <p style={{ color: '#666', marginBottom: 24 }}>
                Sign in to browse inventory, submit leads, and view your commissions.
            </p>

            <form onSubmit={onSubmit}>
                <label htmlFor="email" style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
                    Email
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={inputStyle}
                />

                <label htmlFor="password" style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
                    Password
                </label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={inputStyle}
                />

                <button type="submit" disabled={pending} style={buttonStyle}>
                    {pending ? 'Signing in…' : 'Sign in'}
                </button>
            </form>

            {error && <p style={{ color: '#b91c1c', marginTop: 16, fontSize: 14 }}>{error}</p>}
        </div>
    )
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 16,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    marginBottom: 12,
}

const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    background: '#2563eb',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
}
