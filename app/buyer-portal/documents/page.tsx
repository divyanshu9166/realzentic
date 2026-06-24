import { prisma } from '@/lib/db'
import { requireBuyerAuth } from '@/lib/buyer-session'
import { BuyerNav } from '../_components/BuyerNav'
import { card, list, muted, badge, page as pageStyle } from '../_components/styles'

export const dynamic = 'force-dynamic'

/** Bytes → a short human label for the file size column. */
function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '—'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }
    return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`
}

/**
 * Buyer document downloads (Req 18.5, 18.6, 21.2).
 *
 * Documents are stored generically (`entityType`/`entityId`). A buyer may only
 * download documents attached to their own contact record or to one of their
 * own bookings, so the query is restricted to the session `contactId` and the
 * set of booking ids owned by that contact — never a caller-supplied id. This
 * prevents one buyer from reading another buyer's documents (Req 18.6).
 */
export default async function BuyerDocumentsPage() {
    const { contactId } = await requireBuyerAuth()

    const bookings = await prisma.booking.findMany({
        where: { contactId },
        select: { id: true },
    })
    const bookingIds = bookings.map((b) => b.id)

    const documents = await prisma.document.findMany({
        where: {
            OR: [
                { entityType: 'Contact', entityId: contactId },
                ...(bookingIds.length > 0
                    ? [{ entityType: 'Booking', entityId: { in: bookingIds } }]
                    : []),
            ],
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            type: true,
            fileUrl: true,
            fileName: true,
            fileSize: true,
            status: true,
            createdAt: true,
        },
    })

    return (
        <main style={pageStyle}>
            <BuyerNav active="documents" title="Documents" subtitle="Download your purchase documents" />

            {documents.length === 0 ? (
                <p style={muted}>No documents are available yet.</p>
            ) : (
                <ul style={list}>
                    {documents.map((doc) => (
                        <li
                            key={doc.id}
                            style={{
                                ...card,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                flexWrap: 'wrap',
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 600 }}>{doc.fileName}</div>
                                <div style={{ ...muted, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={badge}>{doc.type}</span>
                                    <span>{formatBytes(doc.fileSize)}</span>
                                    <span>· {new Date(doc.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={doc.fileName}
                                style={{ color: '#2563eb', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
                            >
                                Download
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    )
}
