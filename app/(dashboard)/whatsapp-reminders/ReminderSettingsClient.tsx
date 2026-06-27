'use client';

import { useEffect, useState } from 'react';
import {
    CalendarClock, MapPin, Star, Banknote, Save, Play, Loader2, Info, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import {
    getReminderConfig, saveReminderConfig, runRemindersNow, type ReminderConfigView,
} from '@/app/actions/reminders';
import { useAlertToast } from '@/components/AlertToastProvider';

type RunResult =
    | { success: true; considered: number; sent: number; skipped: number; failed: number }
    | { success: false; error: string };
type LastRun = { followUps: RunResult; siteVisits: RunResult; postVisits: RunResult; payments: RunResult };

const sentOf = (r: RunResult) => (r.success ? r.sent : 0);

export default function ReminderSettingsClient() {
    const { notify } = useAlertToast();
    const [cfg, setCfg] = useState<ReminderConfigView | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [lastRun, setLastRun] = useState<LastRun | null>(null);

    useEffect(() => {
        getReminderConfig().then((res) => {
            if (res.success) setCfg(res.data);
            setLoading(false);
        });
    }, []);

    const set = (patch: Partial<ReminderConfigView>) => setCfg((c) => (c ? { ...c, ...patch } : c));

    const handleSave = async () => {
        if (!cfg) return;
        setSaving(true);
        const res = await saveReminderConfig(cfg);
        setSaving(false);
        notify(res.success ? 'Reminder settings saved' : res.error || 'Failed to save');
    };

    const handleRunNow = async () => {
        setRunning(true);
        const res = await runRemindersNow();
        setRunning(false);
        if (res.success) {
            setLastRun(res.data as LastRun);
            const total =
                sentOf(res.data.followUps) + sentOf(res.data.siteVisits) +
                sentOf(res.data.postVisits) + sentOf(res.data.payments);
            notify(`Reminders run complete — ${total} sent`);
        } else {
            notify(res.error || 'Failed to run reminders');
        }
    };

    if (loading || !cfg) {
        return (
            <div className="space-y-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-surface rounded-2xl" />)}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* 24h-window explainer */}
            <div className="glass-card p-4 flex items-start gap-3 bg-info-light/40">
                <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                    <p className="font-medium">How sending works</p>
                    <p className="text-muted mt-1 text-xs leading-relaxed">
                        Within 24 hours of a contact&apos;s last message, reminders are sent as normal text. Outside that
                        window (the usual case for scheduled reminders), WhatsApp only allows pre-approved
                        <strong className="text-foreground"> message templates</strong>. Enter the exact approved template
                        name for each reminder below — if a template isn&apos;t set, out-of-window sends are skipped
                        automatically (never failed).
                    </p>
                </div>
            </div>

            {/* Follow-ups */}
            <SectionCard
                icon={CalendarClock}
                title="Follow-up reminders"
                desc="Nudge prospects whose follow-up date is due or overdue."
                enabled={cfg.followUpEnabled}
                onToggle={(v) => set({ followUpEnabled: v })}
            >
                <TemplateField label="Prospect template name" value={cfg.followUpTemplate} onChange={(v) => set({ followUpTemplate: v })} hint="Body vars: {{1}} name, {{2}} interest" />
                <ToggleRow label="Also ping the assigned agent" value={cfg.notifyAgentOnFollowUp} onChange={(v) => set({ notifyAgentOnFollowUp: v })} />
                {cfg.notifyAgentOnFollowUp && (
                    <TemplateField label="Agent template name" value={cfg.agentFollowUpTemplate} onChange={(v) => set({ agentFollowUpTemplate: v })} hint="Body vars: {{1}} agent, {{2}} prospect, {{3}} interest" />
                )}
            </SectionCard>

            {/* Site visits */}
            <SectionCard
                icon={MapPin}
                title="Site-visit reminders"
                desc="Remind buyers of an upcoming scheduled visit."
                enabled={cfg.siteVisitEnabled}
                onToggle={(v) => set({ siteVisitEnabled: v })}
            >
                <TemplateField label="Reminder template name" value={cfg.siteVisitTemplate} onChange={(v) => set({ siteVisitTemplate: v })} hint="Body vars: {{1}} name, {{2}} date, {{3}} time, {{4}} address" />
                <NumberField label="Send this many hours before the visit" value={cfg.siteVisitLeadHours} min={1} max={168} onChange={(v) => set({ siteVisitLeadHours: v })} />
            </SectionCard>

            {/* Post-visit feedback */}
            <SectionCard
                icon={Star}
                title="Post-visit feedback request"
                desc="Ask for feedback after a visit is completed (only if no rating yet)."
                enabled={cfg.postVisitEnabled}
                onToggle={(v) => set({ postVisitEnabled: v })}
            >
                <TemplateField label="Feedback template name" value={cfg.postVisitTemplate} onChange={(v) => set({ postVisitTemplate: v })} hint="Body vars: {{1}} name, {{2}} address" />
            </SectionCard>

            {/* Payments */}
            <SectionCard
                icon={Banknote}
                title="Payment reminders"
                desc="Remind buyers of an upcoming payment milestone."
                enabled={cfg.paymentEnabled}
                onToggle={(v) => set({ paymentEnabled: v })}
            >
                <TemplateField label="Payment template name" value={cfg.paymentTemplate} onChange={(v) => set({ paymentTemplate: v })} hint="Body vars: {{1}} name, {{2}} milestone, {{3}} amount, {{4}} due date" />
                <NumberField label="Send this many days before due date" value={cfg.paymentLeadDays} min={1} max={60} onChange={(v) => set({ paymentLeadDays: v })} />
            </SectionCard>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 flex-wrap sticky bottom-0 bg-background/80 backdrop-blur py-3">
                <button onClick={handleRunNow} disabled={running}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50">
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run now
                </button>
                <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save settings
                </button>
            </div>

            {lastRun && (
                <div className="glass-card p-4">
                    <p className="text-sm font-semibold text-foreground mb-3">Last run</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <RunStat label="Follow-ups" r={lastRun.followUps} />
                        <RunStat label="Site visits" r={lastRun.siteVisits} />
                        <RunStat label="Feedback" r={lastRun.postVisits} />
                        <RunStat label="Payments" r={lastRun.payments} />
                    </div>
                </div>
            )}
        </div>
    );
}

function SectionCard({ icon: Icon, title, desc, enabled, onToggle, children }) {
    return (
        <div className="glass-card p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-accent/10 text-accent' : 'bg-surface text-muted'}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                        <p className="text-xs text-muted mt-0.5">{desc}</p>
                    </div>
                </div>
                <Switch value={enabled} onChange={onToggle} />
            </div>
            {enabled && <div className="mt-4 space-y-3 pl-0 sm:pl-13">{children}</div>}
        </div>
    );
}

function Switch({ value, onChange }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!value)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-accent' : 'bg-border'}`}
            aria-pressed={value}
        >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
        </button>
    );
}

function ToggleRow({ label, value, onChange }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{label}</span>
            <Switch value={value} onChange={onChange} />
        </div>
    );
}

function TemplateField({ label, value, onChange, hint }) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
            <input
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder="exact_approved_template_name"
                className="w-full px-3 py-2.5 bg-surface rounded-xl border border-border text-sm font-mono"
            />
            {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
        </div>
    );
}

function NumberField({ label, value, onChange, min, max }) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
            <input
                type="number"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full sm:w-40 px-3 py-2.5 bg-surface rounded-xl border border-border text-sm"
            />
        </div>
    );
}

function RunStat({ label, r }) {
    const ok = r && r.success;
    return (
        <div className="p-3 rounded-xl bg-surface text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            {ok ? (
                <p className="text-sm font-bold text-foreground mt-1 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" /> {r.sent} sent
                </p>
            ) : (
                <p className="text-sm font-bold text-muted mt-1 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> —
                </p>
            )}
            {ok && <p className="text-[10px] text-muted mt-0.5">{r.skipped} skipped · {r.failed} failed</p>}
        </div>
    );
}
