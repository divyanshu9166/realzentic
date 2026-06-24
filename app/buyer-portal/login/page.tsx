'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestBuyerOtp, verifyBuyerOtp } from '@/app/actions/buyer-portal'

/**
 * Buyer portal login (Req 18.2, 18.3, 21.1).
 *
 * Two-step OTP flow: enter phone → receive a 6-digit code over WhatsApp/SMS →
 * enter the code. On success the server action sets the session cookie and the
 * page redirects to the buyer dashboard. Unauthenticated buyers are sent here
 * by `requireBuyerAuth` (Req 21.1).
 */
export default function BuyerLoginPage() {
    const router = useRouter()
    const [step, setStep] = useState<'phone' | 'otp'>('phone')
    const [phone, setPhone] = useState('')
    const [otp, setOtp] = useState('')
    const [channel, setChannel] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function onRequest(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setInfo(null)
        startTransition(async () => {
            const res = await requestBuyerOtp(phone)
            if (!res.success) {
                setError(res.error)
                return
            }
            setChannel(res.data.channel)
            setStep('otp')
            setInfo(`We sent a 6-digit code via ${res.data.channel === 'sms' ? 'SMS' : 'WhatsApp'}.`)
        })
    }

    function onVerify(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
            const res = await verifyBuyerOtp(phone, otp)
            if (!res.success) {
                setError(res.error)
                return
            }
            router.replace('/buyer-portal')
            router.refresh()
        })
    }

    return (
        <div style={{ maxWidth: 380, margin: '64px auto', padding: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Buyer Portal</h1>
            <p style={{ color: '#666', marginBottom: 24 }}>
                Sign in to view your bookings, payments, and documents.
            </p>

            {step === 'phone' ? (
                <form onSubmit={onRequest}>
                    <label htmlFor="phone" style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
                        Phone number
                    </label>
                    <input
                        id="phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 98765 43210"
                        style={inputStyle}
                    />
                    <button type="submit" disabled={pending} style={buttonStyle}>
                        {pending ? 'Sending…' : 'Send code'}
                    </button>
                </form>
            ) : (
                <form onSubmit={onVerify}>
                    <label htmlFor="otp" style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
                        Enter the 6-digit code
                    </label>
                    <input
                        id="otp"
                        name="otp"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        required
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••••"
                        style={{ ...inputStyle, letterSpacing: 6, textAlign: 'center' }}
                    />
                    <button type="submit" disabled={pending} style={buttonStyle}>
                        {pending ? 'Verifying…' : 'Verify & sign in'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setStep('phone')
                            setOtp('')
                            setError(null)
                            setInfo(null)
                        }}
                        style={{ ...buttonStyle, background: 'transparent', color: '#2563eb', marginTop: 8 }}
                    >
                        Use a different number
                    </button>
                </form>
            )}

            {info && <p style={{ color: '#166534', marginTop: 16, fontSize: 14 }}>{info}</p>}
            {error && <p style={{ color: '#b91c1c', marginTop: 16, fontSize: 14 }}>{error}</p>}
            {channel && step === 'otp' && (
                <p style={{ color: '#9ca3af', marginTop: 8, fontSize: 12 }}>
                    The code expires in 5 minutes.
                </p>
            )}
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
