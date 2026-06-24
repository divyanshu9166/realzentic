import { prisma } from '@/lib/db'
import { requireBuyerAuth } from '@/lib/buyer-session'
import { listSupportTickets } from '@/app/actions/buyer-portal'
import { BuyerNav } from '../_components/BuyerNav'
import { card, list, muted, h2, badge, page as pageStyle, errorText } from '../_components/styles'
import { TicketForm } from './TicketForm'

export const dynamic = 'force-dynamic'

/**
 * Buyer support tickets — create and track (Req 18.9).
 *
 * The list comes from `listSupportTickets`, scoped to the authenticated buyer
 * (Req 18.6, 21.2). Bookings (for the optional "related booking" selector) are
 * fetched scoped to the session contact. Creation is delegated to the
 * `TicketForm` client component, which calls `createSupportTicket`.
 */
export default async function BuyerTicketsPage() {
    const { contactId } = await requireBuyerAuth()

    const [ticketsRes, bookings] = await Promise.all([
        listSupportTickets(),
        prisma.booking.findMany({
            where: { contactId },
            orderBy: { bookingDate: 'desc' },
            select: { id: true, unit: { select: { unitNumber: true } } },
        }),
    ])

    const tickets = ticketsRes.success ? ticketsRes.data : []
    const bookingOptions = bookings.map((b) => ({
        id: b.id,
        label: b.unit?.unitNumber ? `Unit ${b.unit.unitNumber}` : `Booking #${b.id}`,
    }))

    return (
        <main style={pageStyle}>
            <BuyerNav active="tickets" title="Support" subtitle="Raise and track your support tickets" />

            <TicketForm bookings={bookingOptions} />

            <h2 style={h2}>Your tickets ({tickets.length})</h2>
            {!ticketsRes.success ? (
                <p style={errorText}>{ticketsRes.error}</p>
            ) : tickets.length === 0 ? (
                <p style={muted}>You have not raised any tickets yet.</p>
            ) : (
                <ul style={list}>
                    {tickets.map((t) => (
                        <li key={t.id} style={card}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <strong>{t.subject}</strong>
                                <span style={{ display: 'flex', gap: 6 }}>
                                    <span style={badge}>{t.status}</span>
                                    <span style={badge}>{t.priority}</span>
                                </span>
                            </div>
                            <div style={{ ...muted, marginTop: 4 }}>
                                {t.category ? `${t.category} · ` : ''}
                                {new Date(t.createdAt).toLocaleDateString()}
                            </div>
                            <p style={{ marginTop: 8, fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap' }}>
                                {t.description}
                            </p>
                            {t.resolutionNotes ? (
                                <div
                                    style={{
                                        marginTop: 10,
                                        padding: 10,
                                        background: '#f0fdf4',
                                        borderRadius: 8,
                                        fontSize: 13,
                                    }}
                                >
                                    <strong>Resolution:</strong> {t.resolutionNotes}
                                    {t.resolvedAt ? (
                                        <span style={muted}> · {new Date(t.resolvedAt).toLocaleDateString()}</span>
                                    ) : null}
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
        </main>
    )
}
