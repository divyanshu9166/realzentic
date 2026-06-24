import { prisma } from '@/lib/db'
import { requireBuyerAuth } from '@/lib/buyer-session'
import { getPossessionChecklist } from '@/app/actions/buyer-portal'
import { BuyerNav } from '../_components/BuyerNav'
import { list, muted, page as pageStyle } from '../_components/styles'
import { PossessionClient } from './PossessionClient'

export const dynamic = 'force-dynamic'

/**
 * Possession checklists for the authenticated buyer — view, snag, sign-off
 * (Req 18.10). Bookings are fetched scoped to the session contact (Req 18.6,
 * 21.2); each booking's checklist comes from `getPossessionChecklist`, which
 * re-verifies booking ownership. Bookings without a prepared checklist are
 * shown with a placeholder. Interactive snag/sign-off is handled by the
 * `PossessionClient` component.
 */
export default async function BuyerPossessionPage() {
    const { contactId } = await requireBuyerAuth()

    const bookings = await prisma.booking.findMany({
        where: { contactId },
        orderBy: { bookingDate: 'desc' },
        select: { id: true, unit: { select: { unitNumber: true } } },
    })

    const checklists = await Promise.all(
        bookings.map(async (b) => {
            const res = await getPossessionChecklist(b.id)
            return {
                bookingId: b.id,
                label: b.unit?.unitNumber ? `Unit ${b.unit.unitNumber}` : `Booking #${b.id}`,
                checklist: res.success ? res.data : null,
            }
        })
    )

    return (
        <main style={pageStyle}>
            <BuyerNav active="possession" title="Possession" subtitle="Inspect, raise snags, and sign off" />

            {bookings.length === 0 ? (
                <p style={muted}>No bookings yet.</p>
            ) : (
                <ul style={list}>
                    {checklists.map((c) =>
                        c.checklist ? (
                            <PossessionClient
                                key={c.bookingId}
                                bookingId={c.bookingId}
                                label={c.label}
                                checklist={c.checklist}
                            />
                        ) : (
                            <li
                                key={c.bookingId}
                                style={{
                                    border: '1px solid #e5e7eb',
                                    borderRadius: 10,
                                    padding: 16,
                                    background: '#fff',
                                }}
                            >
                                <strong>{c.label}</strong>
                                <p style={{ ...muted, marginTop: 4 }}>
                                    No possession checklist has been prepared for this booking yet.
                                </p>
                            </li>
                        )
                    )}
                </ul>
            )}
        </main>
    )
}
