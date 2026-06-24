import { prisma } from '@/lib/db'
import { requireBuyerAuth } from '@/lib/buyer-session'
import { BuyerNav } from '../_components/BuyerNav'
import { ReferFriendClient } from './_ReferFriendClient'
import { card, list, muted, h2, page as pageStyle } from '../_components/styles'

export const dynamic = 'force-dynamic'

/**
 * Buyer portal "Refer a Friend" page (Req 19.6).
 *
 * Requirements satisfied:
 *   - 19.6 — while a buyer session is verified, the Buyer_Portal displays a
 *     "Refer a Friend" section linked to an active ReferralProgram.
 *   - 21.1 / 21.2 — `requireBuyerAuth` redirects unauthenticated requests to
 *     the login; every query is scoped to the session's `contactId`.
 *
 * Data flow:
 *   - Fetches the first active `ReferralProgram` to display program details
 *     and the shareable invite link.
 *   - Lists referrals submitted by the authenticated buyer (as referrer) so
 *     they can track the status of their invites.
 *   - The interactive "submit a referral" form lives in `ReferFriendClient`
 *     (client component) to keep this server component simple.
 */
export default async function ReferPage() {
    const { contactId } = await requireBuyerAuth()

    // Find the first active program to link (Req 19.6).
    const activeProgram = await prisma.referralProgram.findFirst({
        where: { active: true },
        orderBy: { id: 'desc' },
        select: {
            id: true,
            name: true,
            rewardType: true,
            rewardValue: true,
            terms: true,
            validFrom: true,
            validUntil: true,
        },
    })

    // Past referrals submitted by this buyer (scoped to contactId, Req 21.2).
    const myReferrals = await prisma.referral.findMany({
        where: { referrerId: contactId },
        orderBy: { id: 'desc' },
        include: {
            referred: { select: { name: true } },
            program: { select: { name: true, rewardType: true } },
        },
    })

    const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { name: true },
    })

    return (
        <main style={pageStyle}>
            <BuyerNav
                active="refer"
                title="Refer a Friend"
                subtitle="Invite friends and earn rewards"
            />

            {!activeProgram ? (
                <section style={card}>
                    <p style={muted}>
                        No active referral program at the moment. Check back soon!
                    </p>
                </section>
            ) : (
                <>
                    {/* Program details */}
                    <section style={{ ...card, marginBottom: 24 }}>
                        <h2 style={h2}>{activeProgram.name}</h2>
                        <ProgramDetails program={activeProgram} contactId={contactId} />
                    </section>

                    {/* Submit referral form */}
                    <ReferFriendClient
                        contactId={contactId}
                        programId={activeProgram.id}
                        contactName={contact?.name ?? undefined}
                    />
                </>
            )}

            {/* My referrals tracker */}
            {myReferrals.length > 0 && (
                <section style={{ marginTop: 32 }}>
                    <h2 style={h2}>My referrals ({myReferrals.length})</h2>
                    <ul style={list}>
                        {myReferrals.map((r) => (
                            <li key={r.id} style={card}>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <div style={{ fontWeight: 600 }}>
                                        {r.referred?.name ?? `Contact #${r.referredId}`}
                                    </div>
                                    <StatusBadge status={r.status} rewardPaid={r.rewardPaid} />
                                </div>
                                <div style={{ ...muted, marginTop: 4 }}>
                                    Program: {r.program?.name ?? '—'} · {r.program?.rewardType ?? ''}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    )
}

// ─── Program details card (server-rendered) ─────────

function ProgramDetails({
    program,
    contactId,
}: {
    program: {
        id: number
        name: string
        rewardType: string
        rewardValue: { toString(): string }
        terms: string | null
        validFrom: Date | null
        validUntil: Date | null
    }
    contactId: number
}) {
    const origin = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
    const shareLink = `${origin}/buyer-portal/refer?ref=${program.id}&from=${contactId}`

    const rewardLabel =
        program.rewardType === 'Cash'
            ? `₹${Number(program.rewardValue).toLocaleString('en-IN')}`
            : program.rewardType === 'Discount'
                ? `${Number(program.rewardValue)}% discount`
                : `Gift worth ₹${Number(program.rewardValue).toLocaleString('en-IN')}`

    const formatDate = (d: Date | null) =>
        d
            ? new Date(d).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            })
            : null

    return (
        <div>
            <p style={{ fontSize: 15, color: '#111827', marginBottom: 8 }}>
                Earn{' '}
                <strong style={{ color: '#2563eb' }}>{rewardLabel}</strong> for every
                friend you refer who makes a purchase.
            </p>

            {program.terms && (
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                    {program.terms}
                </p>
            )}

            {(program.validFrom || program.validUntil) && (
                <p style={{ fontSize: 12, color: '#9ca3af' }}>
                    Valid:{' '}
                    {[formatDate(program.validFrom), formatDate(program.validUntil)]
                        .filter(Boolean)
                        .join(' → ')}
                </p>
            )}

            {/* Shareable referral link (Req 19.5 also exposes per-buyer links) */}
            <div
                style={{
                    marginTop: 16,
                    padding: '12px 14px',
                    background: '#f0f9ff',
                    borderRadius: 8,
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                }}
            >
                <span style={{ fontSize: 13, color: '#1d4ed8', flex: 1, wordBreak: 'break-all' }}>
                    {shareLink}
                </span>
                {/* Copy-to-clipboard handled client-side via the ReferFriendClient */}
            </div>
        </div>
    )
}

// ─── Status badge ────────────────────────────────────

function StatusBadge({
    status,
    rewardPaid,
}: {
    status: string
    rewardPaid: boolean
}) {
    const color =
        rewardPaid
            ? { background: '#dcfce7', color: '#166534' }
            : status === 'Eligible'
                ? { background: '#dbeafe', color: '#1d4ed8' }
                : status === 'Paid'
                    ? { background: '#dcfce7', color: '#166534' }
                    : { background: '#f3f4f6', color: '#374151' }

    return (
        <span
            style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                ...color,
            }}
        >
            {rewardPaid ? 'Reward Paid' : status}
        </span>
    )
}
