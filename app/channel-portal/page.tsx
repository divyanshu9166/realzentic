import { prisma } from '@/lib/db'
import { requireChannelPartnerAuth } from '@/lib/cp-session'
import { logoutChannelPartner } from '@/app/actions/channel-portal'

export const dynamic = 'force-dynamic'

/**
 * Channel Partner portal dashboard (Req 7.1, 7.3, 7.8, 21.1, 21.2).
 *
 * `requireChannelPartnerAuth` redirects unauthenticated or expired requests to
 * the portal login (Req 7.8, 21.1). Every query on this page is scoped to the
 * session's signed `partnerId`, so a partner can only ever see their own
 * record and leads — one partner cannot read another's data (Req 7.3, 21.2).
 * The richer inventory / lead-submission / commission features are built in
 * later tasks.
 */
export default async function ChannelPortalHome() {
    const { partnerId } = await requireChannelPartnerAuth()

    async function handleLogout() {
        'use server'
        await logoutChannelPartner()
    }

    const [partner, leadCount] = await Promise.all([
        prisma.channelPartner.findUnique({
            where: { id: partnerId },
            select: { name: true, company: true, email: true, status: true },
        }),
        // Scoped to the authenticated partner only (Req 7.3, 21.2).
        prisma.cPLead.count({ where: { partnerId } }),
    ])

    return (
        <main style={{ maxWidth: 760, margin: '40px auto', padding: 24 }}>
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 24,
                }}
            >
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700 }}>
                        Welcome{partner?.name ? `, ${partner.name}` : ''}
                    </h1>
                    <p style={{ color: '#6b7280', fontSize: 14 }}>
                        {partner?.company ? `${partner.company} · ` : ''}
                        {partner?.email ?? ''}
                    </p>
                </div>
                <form action={handleLogout}>
                    <button
                        type="submit"
                        style={{
                            padding: '8px 14px',
                            border: '1px solid #d1d5db',
                            borderRadius: 8,
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                        }}
                    >
                        Log out
                    </button>
                </form>
            </header>

            <section>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Your activity</h2>
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
                    <li
                        style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 10,
                            padding: 16,
                        }}
                    >
                        <div style={{ fontWeight: 600 }}>Leads submitted</div>
                        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{leadCount}</div>
                    </li>
                </ul>
            </section>
        </main>
    )
}
