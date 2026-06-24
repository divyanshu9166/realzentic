'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupportTicket } from '@/app/actions/buyer-portal'
import { card, input, h2, primaryButton, errorText, successText } from '../_components/styles'

/**
 * Support-ticket creation form (Req 18.9). Submits to `createSupportTicket`,
 * which validates the required fields server-side and scopes the ticket to the
 * authenticated buyer. On success the list (rendered by the parent server
 * component) is refreshed.
 */
export function TicketForm({ bookings }: { bookings: { id: number; label: string }[] }) {
    const router = useRouter()
    const [subject, setSubject] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('')
    const [bookingId, setBookingId] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    const [pending, startTransition] = useTransition()

    function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setDone(false)
        startTransition(async () => {
            const res = await createSupportTicket({
                subject,
                description,
                category: category.trim() === '' ? null : category,
                bookingId: bookingId === '' ? null : Number(bookingId),
            })
            if (!res.success) {
                setError(res.error)
                return
            }
            setSubject('')
            setDescription('')
            setCategory('')
            setBookingId('')
            setDone(true)
            router.refresh()
        })
    }

    return (
        <form onSubmit={onSubmit} style={{ ...card, marginBottom: 24 }}>
            <h2 style={h2}>Raise a support ticket</h2>

            <label htmlFor="subject" style={labelStyle}>
                Subject
            </label>
            <input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                required
                placeholder="Brief summary"
                style={input}
            />

            <label htmlFor="description" style={labelStyle}>
                Description
            </label>
            <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                required
                rows={4}
                placeholder="Describe your issue"
                style={{ ...input, resize: 'vertical' }}
            />

            <label htmlFor="category" style={labelStyle}>
                Category (optional)
            </label>
            <input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Payment, Construction, Documentation"
                style={input}
            />

            {bookings.length > 0 ? (
                <>
                    <label htmlFor="booking" style={labelStyle}>
                        Related booking (optional)
                    </label>
                    <select
                        id="booking"
                        value={bookingId}
                        onChange={(e) => setBookingId(e.target.value)}
                        style={input}
                    >
                        <option value="">None</option>
                        {bookings.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.label}
                            </option>
                        ))}
                    </select>
                </>
            ) : null}

            <button type="submit" disabled={pending} style={primaryButton}>
                {pending ? 'Submitting…' : 'Submit ticket'}
            </button>

            {error && <p style={errorText}>{error}</p>}
            {done && <p style={successText}>Your ticket has been created.</p>}
        </form>
    )
}

const labelStyle = { display: 'block', marginBottom: 6, fontSize: 14 } as const
