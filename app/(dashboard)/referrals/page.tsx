'use client';

/**
 * Referrals admin page (Req 19.5).
 *
 * Displays:
 *   - Programs tab: list of `ReferralProgram` records with create/edit actions.
 *   - Referrals tab: list of `Referral` records showing referrer, referred
 *     contact, program, status, and reward amount.
 *   - Shareable link panel: a per-program shareable referral link copied to
 *     the clipboard.
 *
 * All mutations delegate to the `Referral_Service` server actions in
 * `app/actions/referrals.ts`. Data is loaded client-side on mount via those
 * same actions so the page stays in the existing `'use client'` dashboard
 * pattern.
 *
 * Requirements: 19.1, 19.5.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    Plus, Edit2, Users2, Share2, CheckCircle2, Gift, BadgeDollarSign,
    Percent, ListChecks, Loader2, ClipboardCopy, ClipboardCheck,
} from 'lucide-react';
import {
    listReferralPrograms,
    listReferrals,
    createReferralProgram,
    updateReferralProgram,
} from '@/app/actions/referrals';
import Modal from '@/components/Modal';
import { useAlertToast } from '@/components/AlertToastProvider';

// AlertToastProvider is a JS file; TypeScript infers notify as (message) => void.
// The actual runtime implementation accepts an optional options object; cast it here.
type NotifyFn = (message: string, options?: { variant?: string }) => void;

// ─── Types ────────────────────────────────────────────

interface ProgramRow {
    id: number;
    name: string;
    rewardType: string;
    rewardValue: unknown; // Prisma Decimal, number, or string at runtime
    active: boolean;
    terms: string | null;
    validFrom: Date | null;
    validUntil: Date | null;
}

interface ReferralRow {
    id: number;
    status: string;
    rewardAmount: unknown; // Prisma Decimal, number, or string at runtime
    rewardPaid: boolean;
    referrer: { id: number; name: string };
    referred: { id: number; name: string };
    program: { id: number; name: string; rewardType: string };
}

// ─── Helpers ─────────────────────────────────────────

const REWARD_TYPE_ICON: Record<string, React.FC<{ className?: string }>> = {
    Cash: BadgeDollarSign,
    Discount: Percent,
    Gift: Gift,
};

const STATUS_COLOR: Record<string, string> = {
    Pending: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    Eligible: 'bg-info-light text-info border-info/20',
    Paid: 'bg-success-light text-success border-success/20',
};

const formatINR = (n: unknown) =>
    `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDate = (d: Date | string | null | undefined) => {
    if (!d) return '—';
    try {
        return new Date(d as string | Date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return '—';
    }
};

const REWARD_TYPES = ['Cash', 'Discount', 'Gift'] as const;

// ─── Page component ───────────────────────────────────

export default function ReferralsPage() {
    const { notify: _notify } = useAlertToast();
    const notify = _notify as NotifyFn;
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'programs' | 'referrals'>('programs');

    const [programs, setPrograms] = useState<ProgramRow[]>([]);
    const [referrals, setReferrals] = useState<ReferralRow[]>([]);

    // Modal state
    const [showProgramModal, setShowProgramModal] = useState(false);
    const [editProgram, setEditProgram] = useState<ProgramRow | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Shareable link copy state
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const refresh = useCallback(async () => {
        const [progRes, refRes] = await Promise.all([
            listReferralPrograms(),
            listReferrals(),
        ]);
        if (progRes.success) setPrograms(progRes.data as unknown as ProgramRow[]);
        else notify(progRes.error, { variant: 'danger' });
        if (refRes.success) setReferrals(refRes.data as unknown as ReferralRow[]);
        else notify(refRes.error, { variant: 'danger' });
    }, [notify]);

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, [refresh]);

    // ─── Save program (create or update) ─────────────
    const handleSaveProgram = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = e.currentTarget;
        const payload = {
            name: (f.elements.namedItem('name') as HTMLInputElement).value,
            rewardType: (f.elements.namedItem('rewardType') as HTMLSelectElement).value,
            rewardValue: Number(
                (f.elements.namedItem('rewardValue') as HTMLInputElement).value || 0
            ),
            active:
                (f.elements.namedItem('active') as HTMLInputElement).checked,
            terms: (f.elements.namedItem('terms') as HTMLTextAreaElement).value || undefined,
            validFrom:
                (f.elements.namedItem('validFrom') as HTMLInputElement).value || undefined,
            validUntil:
                (f.elements.namedItem('validUntil') as HTMLInputElement).value || undefined,
        };

        setSubmitting(true);
        const res = editProgram
            ? await updateReferralProgram(editProgram.id, payload)
            : await createReferralProgram(payload);
        setSubmitting(false);

        if (res.success) {
            notify(editProgram ? 'Program updated' : 'Program created', { variant: 'success' });
            setShowProgramModal(false);
            setEditProgram(null);
            await refresh();
        } else {
            notify(res.error, { variant: 'danger' });
        }
    };

    // ─── Copy shareable link ──────────────────────────
    const handleCopyLink = (program: ProgramRow) => {
        const origin =
            typeof window !== 'undefined' ? window.location.origin : '';
        const link = `${origin}/buyer-portal?ref=${program.id}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedId(program.id);
            setTimeout(() => setCopiedId(null), 2500);
        });
    };

    // ─── Open edit modal ──────────────────────────────
    const handleEditProgram = (p: ProgramRow) => {
        setEditProgram(p);
        setShowProgramModal(true);
    };

    const openCreate = () => {
        setEditProgram(null);
        setShowProgramModal(true);
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 w-48 bg-surface rounded-lg" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-24 bg-surface rounded-2xl" />
                    ))}
                </div>
                <div className="h-64 bg-surface rounded-2xl" />
            </div>
        );
    }

    const tabs = [
        { id: 'programs' as const, label: 'Programs', icon: ListChecks },
        { id: 'referrals' as const, label: 'Referrals', icon: Users2 },
    ];

    return (
        <div className="space-y-6 animate-[fade-in_0.5s_ease-out] min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Users2 className="w-6 h-6 text-accent" /> Referral Programs
                    </h1>
                    <p className="text-xs md:text-sm text-muted mt-1">
                        Manage programs, track referrals, and share invite links.
                    </p>
                </div>
                {activeTab === 'programs' && (
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all"
                    >
                        <Plus className="w-4 h-4" /> New Program
                    </button>
                )}
            </div>

            {/* Summary metrics */}
            <MetricsRow programs={programs} referrals={referrals} />

            {/* Tabs */}
            <div className="flex bg-surface rounded-xl border border-border p-0.5 w-fit overflow-x-auto">
                {tabs.map((t) => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === t.id
                                ? 'bg-accent text-white'
                                : 'text-muted hover:text-foreground'
                                }`}
                        >
                            <Icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Programs tab (Req 19.5: programs list + create/edit + shareable link) */}
            {activeTab === 'programs' && (
                <ProgramsTab
                    programs={programs}
                    copiedId={copiedId}
                    onEdit={handleEditProgram}
                    onCopyLink={handleCopyLink}
                />
            )}

            {/* Referrals tab (Req 19.5: referral tracking) */}
            {activeTab === 'referrals' && <ReferralsTab referrals={referrals} />}

            {/* Create / Edit program modal */}
            <Modal
                isOpen={showProgramModal}
                onClose={() => {
                    setShowProgramModal(false);
                    setEditProgram(null);
                }}
                title={editProgram ? 'Edit Program' : 'New Referral Program'}
                size="lg"
            >
                <ProgramForm
                    initial={editProgram}
                    submitting={submitting}
                    onSubmit={handleSaveProgram}
                    onCancel={() => {
                        setShowProgramModal(false);
                        setEditProgram(null);
                    }}
                />
            </Modal>
        </div>
    );
}

// ─── Metrics row ─────────────────────────────────────

function MetricsRow({
    programs,
    referrals,
}: {
    programs: ProgramRow[];
    referrals: ReferralRow[];
}) {
    const active = programs.filter((p) => p.active).length;
    const total = referrals.length;
    const eligible = referrals.filter((r) => r.status === 'Eligible').length;
    const paid = referrals.filter((r) => r.rewardPaid).length;

    const cards = [
        {
            label: 'Active Programs',
            value: active,
            icon: ListChecks,
            tint: 'text-accent bg-accent/10',
            money: false,
        },
        {
            label: 'Total Referrals',
            value: total,
            icon: Users2,
            tint: 'text-info bg-info-light',
            money: false,
        },
        {
            label: 'Eligible',
            value: eligible,
            icon: CheckCircle2,
            tint: 'text-amber-700 bg-amber-500/10',
            money: false,
        },
        {
            label: 'Rewards Paid',
            value: paid,
            icon: Gift,
            tint: 'text-success bg-success-light',
            money: false,
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cards.map((c) => {
                const Icon = c.icon;
                return (
                    <div key={c.label} className="glass-card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted">{c.label}</span>
                            <span
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.tint}`}
                            >
                                <Icon className="w-4 h-4" />
                            </span>
                        </div>
                        <p className="text-lg md:text-xl font-bold text-foreground">
                            {c.value}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Programs tab ─────────────────────────────────────

function ProgramsTab({
    programs,
    copiedId,
    onEdit,
    onCopyLink,
}: {
    programs: ProgramRow[];
    copiedId: number | null;
    onEdit: (p: ProgramRow) => void;
    onCopyLink: (p: ProgramRow) => void;
}) {
    if (programs.length === 0) {
        return (
            <div className="glass-card py-16 text-center text-sm text-muted">
                <Users2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-foreground">No referral programs yet</p>
                <p className="mt-1">Create a program above to get started.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {programs.map((p) => {
                const Icon = REWARD_TYPE_ICON[p.rewardType] ?? Gift;
                const copied = copiedId === p.id;
                return (
                    <div key={p.id} className="glass-card p-5 flex flex-col gap-3">
                        {/* Program header */}
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                                    <Icon className="w-4 h-4 text-accent" />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-semibold text-foreground truncate">{p.name}</p>
                                    <p className="text-xs text-muted">{p.rewardType}</p>
                                </div>
                            </div>
                            <span
                                className={`badge flex-shrink-0 ${p.active
                                    ? 'bg-success-light text-success border-success/20'
                                    : 'bg-surface-hover text-muted border-border'
                                    }`}
                            >
                                {p.active ? 'Active' : 'Inactive'}
                            </span>
                        </div>

                        {/* Reward value */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted">Reward:</span>
                            <span className="text-sm font-semibold text-accent">
                                {p.rewardType === 'Cash'
                                    ? formatINR(p.rewardValue)
                                    : p.rewardType === 'Discount'
                                        ? `${Number(p.rewardValue)}% off`
                                        : `Gift worth ${formatINR(p.rewardValue)}`}
                            </span>
                        </div>

                        {/* Validity */}
                        {(p.validFrom || p.validUntil) && (
                            <p className="text-xs text-muted">
                                {formatDate(p.validFrom)} → {formatDate(p.validUntil)}
                            </p>
                        )}

                        {/* Terms */}
                        {p.terms && (
                            <p className="text-xs text-muted line-clamp-2">{p.terms}</p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1 mt-auto">
                            <button
                                onClick={() => onEdit(p)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                            >
                                <Edit2 className="w-3.5 h-3.5" /> Edit
                            </button>
                            {/* Shareable link (Req 19.5) */}
                            <button
                                onClick={() => onCopyLink(p)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${copied
                                    ? 'bg-success-light text-success border-success/30'
                                    : 'border-border text-muted hover:text-foreground hover:border-accent/30'
                                    }`}
                            >
                                {copied ? (
                                    <>
                                        <ClipboardCheck className="w-3.5 h-3.5" /> Copied!
                                    </>
                                ) : (
                                    <>
                                        <Share2 className="w-3.5 h-3.5" /> Copy Link
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Referrals tab ────────────────────────────────────

function ReferralsTab({ referrals }: { referrals: ReferralRow[] }) {
    if (referrals.length === 0) {
        return (
            <div className="glass-card py-16 text-center text-sm text-muted">
                <Users2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-foreground">No referrals recorded yet</p>
            </div>
        );
    }

    return (
        <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="crm-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Referrer</th>
                            <th>Referred</th>
                            <th>Program</th>
                            <th>Reward</th>
                            <th>Status</th>
                            <th>Paid</th>
                        </tr>
                    </thead>
                    <tbody>
                        {referrals.map((r) => (
                            <tr key={r.id}>
                                <td className="text-muted">{r.id}</td>
                                <td className="font-medium text-foreground">
                                    {r.referrer?.name ?? `#${r.referrer?.id ?? '—'}`}
                                </td>
                                <td className="text-foreground">
                                    {r.referred?.name ?? `#${r.referred?.id ?? '—'}`}
                                </td>
                                <td className="text-muted">
                                    {r.program?.name ?? '—'}
                                    {r.program?.rewardType && (
                                        <span className="ml-1 text-[11px] text-muted/70">
                                            ({r.program.rewardType})
                                        </span>
                                    )}
                                </td>
                                <td className="text-accent font-medium">
                                    {formatINR(r.rewardAmount)}
                                </td>
                                <td>
                                    <span
                                        className={`badge ${STATUS_COLOR[r.status] ?? 'bg-surface text-muted border-border'}`}
                                    >
                                        {r.status}
                                    </span>
                                </td>
                                <td>
                                    {r.rewardPaid ? (
                                        <CheckCircle2 className="w-4 h-4 text-success" />
                                    ) : (
                                        <span className="text-xs text-muted">—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Program create/edit form ─────────────────────────

function ProgramForm({
    initial,
    submitting,
    onSubmit,
    onCancel,
}: {
    initial: ProgramRow | null;
    submitting: boolean;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
}) {
    const toInputDate = (d: Date | string | null | undefined) => {
        if (!d) return '';
        try {
            return new Date(d).toISOString().split('T')[0];
        } catch {
            return '';
        }
    };

    return (
        <form className="space-y-4" onSubmit={onSubmit}>
            {/* Name */}
            <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                    Program name <span className="text-danger">*</span>
                </label>
                <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g. Summer Referral 2025"
                    defaultValue={initial?.name ?? ''}
                    className="w-full"
                />
            </div>

            {/* Reward type + value */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                        Reward type <span className="text-danger">*</span>
                    </label>
                    <select
                        name="rewardType"
                        required
                        defaultValue={initial?.rewardType ?? 'Cash'}
                        className="w-full"
                    >
                        {REWARD_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                        Reward value <span className="text-danger">*</span>
                    </label>
                    <input
                        type="number"
                        name="rewardValue"
                        required
                        min="0"
                        step="0.01"
                        placeholder="e.g. 5000"
                        defaultValue={initial ? Number(initial.rewardValue) : ''}
                        className="w-full"
                    />
                </div>
            </div>

            {/* Validity window */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                        Valid from
                    </label>
                    <input
                        type="date"
                        name="validFrom"
                        defaultValue={toInputDate(initial?.validFrom)}
                        className="w-full"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                        Valid until
                    </label>
                    <input
                        type="date"
                        name="validUntil"
                        defaultValue={toInputDate(initial?.validUntil)}
                        className="w-full"
                    />
                </div>
            </div>

            {/* Terms */}
            <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                    Terms &amp; conditions
                </label>
                <textarea
                    name="terms"
                    rows={3}
                    placeholder="Optional: describe program terms..."
                    defaultValue={initial?.terms ?? ''}
                    className="w-full resize-none"
                />
            </div>

            {/* Active toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    name="active"
                    defaultChecked={initial !== null ? initial.active : true}
                    className="w-4 h-4 accent-[var(--accent,#6366f1)]"
                />
                <span className="text-sm text-foreground">Program is active</span>
            </label>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
                >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create program'}
                </button>
            </div>
        </form>
    );
}
