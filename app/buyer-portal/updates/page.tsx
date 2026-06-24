import { requireBuyerAuth } from '@/lib/buyer-session'
import { getConstructionTimeline } from '@/app/actions/buyer-portal'
import { BuyerNav } from '../_components/BuyerNav'
import { card, muted, badge, page as pageStyle, errorText } from '../_components/styles'

export const dynamic = 'force-dynamic'

/**
 * Construction update timeline for the authenticated buyer (Req 18.8).
 *
 * Updates are sourced from `getConstructionTimeline`, which scopes them to the
 * projects the buyer has actually purchased into (Req 18.6, 21.2) and returns
 * them newest-first. Rendered as a vertical timeline with the milestone
 * percentage and any progress photos.
 */
export default async function BuyerUpdatesPage() {
    await requireBuyerAuth()

    const res = await getConstructionTimeline()
    const updates = res.success ? res.data : []

    return (
        <main style={pageStyle}>
            <BuyerNav active="updates" title="Construction updates" subtitle="Progress on your projects" />

            {!res.success ? (
                <p style={errorText}>{res.error}</p>
            ) : updates.length === 0 ? (
                <p style={muted}>No construction updates have been posted yet.</p>
            ) : (
                <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 }}>
                    {updates.map((u) => (
                        <li key={u.id} style={card}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <strong>{u.title}</strong>
                                <span style={muted}>{new Date(u.date).toLocaleDateString()}</span>
                            </div>
                            <div style={{ ...muted, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={badge}>{u.projectName || `Project #${u.projectId}`}</span>
                                {u.category ? <span style={badge}>{u.category}</span> : null}
                                <span>{u.milestonePct}% complete</span>
                            </div>

                            <div style={{ marginTop: 8, height: 6, background: '#f1f5f9', borderRadius: 999 }}>
                                <div
                                    style={{
                                        width: `${Math.max(0, Math.min(100, u.milestonePct))}%`,
                                        height: '100%',
                                        background: '#2563eb',
                                        borderRadius: 999,
                                    }}
                                />
                            </div>

                            {u.description ? (
                                <p style={{ marginTop: 10, fontSize: 14, color: '#374151' }}>{u.description}</p>
                            ) : null}

                            {u.photos.length > 0 ? (
                                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                    {u.photos.map((src, i) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            key={i}
                                            src={src}
                                            alt={`${u.title} photo ${i + 1}`}
                                            style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8 }}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ol>
            )}
        </main>
    )
}
