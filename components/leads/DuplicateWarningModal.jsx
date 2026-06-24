'use client';

/**
 * DuplicateWarningModal
 *
 * Implements Req 11.2: when potential duplicates are found on lead creation,
 * show a warning modal listing each matched Contact with a confidence score
 * (0–100) and offer "Merge" or "Create New" actions.
 *
 * Props:
 *   isOpen       – boolean controlling modal visibility
 *   matches      – DuplicateMatch[] from findDuplicates (id, name, phone, email, confidence)
 *   pendingLead  – the form data the user just entered (name, phone, email, ...)
 *   onMerge(targetId, sourceId, fieldChoices) – called when the user picks Merge
 *   onCreateNew()  – called when the user wants to proceed and create a new lead anyway
 *   onClose()      – called when the user dismisses the modal without acting
 */

import { useState } from 'react';
import { AlertTriangle, User, Phone, Mail, GitMerge, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import Modal from '@/components/Modal';

/**
 * Returns a colour class pairing (background + text) for a confidence score.
 * High ≥ 80: red/danger; medium 50–79: amber/warning; low < 50: blue/info.
 */
function confidenceColor(score) {
    if (score >= 80) return 'bg-danger-light text-danger';
    if (score >= 50) return 'bg-amber-500/10 text-amber-700';
    return 'bg-info-light text-info';
}

/**
 * Human-readable confidence label.
 */
function confidenceLabel(score) {
    if (score >= 80) return 'High';
    if (score >= 50) return 'Medium';
    return 'Low';
}

/**
 * A single duplicate match card. Shows the existing contact's info plus the
 * confidence badge and a "Merge with this contact" button.
 */
function MatchCard({ match, pendingLead, onMerge }) {
    const [showFieldChoices, setShowFieldChoices] = useState(false);
    const [fieldChoices, setFieldChoices] = useState({});

    // The fields the user can resolve when merging.
    const mergeableFields = [
        { key: 'name', label: 'Name', existing: match.name, incoming: pendingLead.name },
        { key: 'phone', label: 'Phone', existing: match.phone, incoming: pendingLead.phone },
        { key: 'email', label: 'Email', existing: match.email || '—', incoming: pendingLead.email || '—' },
    ];

    const handleMerge = () => {
        // targetId = the existing Contact; the new lead's contact will be created
        // briefly then merged in, but the server action accepts targetId + sourceId
        // where source is the new (incoming) candidate. For the UI we pass the
        // existing contact as target so its history is preserved.
        onMerge(match.id, fieldChoices);
    };

    return (
        <div className="glass-card p-4 space-y-3">
            {/* Contact header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent flex-shrink-0">
                        {match.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-foreground">{match.name}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            {match.phone && (
                                <span className="flex items-center gap-1 text-xs text-muted">
                                    <Phone className="w-3 h-3" />
                                    {match.phone}
                                </span>
                            )}
                            {match.email && (
                                <span className="flex items-center gap-1 text-xs text-muted">
                                    <Mail className="w-3 h-3" />
                                    {match.email}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Confidence badge */}
                <div className={`flex-shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl ${confidenceColor(match.confidence)}`}>
                    <span className="text-xs font-bold leading-none">{match.confidence}</span>
                    <span className="text-[10px] leading-none mt-0.5">{confidenceLabel(match.confidence)}</span>
                </div>
            </div>

            {/* Field choices (optional, collapsible) */}
            <button
                type="button"
                onClick={() => setShowFieldChoices((v) => !v)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover font-medium transition-colors"
                aria-expanded={showFieldChoices}
            >
                {showFieldChoices ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Choose which values to keep
            </button>

            {showFieldChoices && (
                <div className="space-y-2 pt-1 border-t border-border">
                    {mergeableFields.map((f) => (
                        <div key={f.key} className="space-y-1">
                            <p className="text-xs font-medium text-muted">{f.label}</p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFieldChoices((prev) => ({ ...prev, [f.key]: 'target' }))}
                                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-all ${fieldChoices[f.key] === 'source'
                                            ? 'bg-surface border-border text-muted'
                                            : 'bg-accent/10 border-accent/30 text-accent font-medium'
                                        }`}
                                >
                                    Keep existing: {f.existing}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFieldChoices((prev) => ({ ...prev, [f.key]: 'source' }))}
                                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-all ${fieldChoices[f.key] === 'source'
                                            ? 'bg-accent/10 border-accent/30 text-accent font-medium'
                                            : 'bg-surface border-border text-muted'
                                        }`}
                                >
                                    Use new: {f.incoming}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Merge CTA */}
            <button
                type="button"
                onClick={handleMerge}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-semibold transition-all"
            >
                <GitMerge className="w-3.5 h-3.5" />
                Merge with this contact
            </button>
        </div>
    );
}

export default function DuplicateWarningModal({
    isOpen,
    matches = [],
    pendingLead = {},
    onMerge,
    onCreateNew,
    onClose,
}) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Possible Duplicate Lead" size="lg">
            <div className="space-y-5">
                {/* Warning banner */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                            {matches.length === 1
                                ? '1 potential duplicate found'
                                : `${matches.length} potential duplicates found`}
                        </p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                            An existing contact matches by phone, email, or name. You can merge
                            this lead with an existing contact or proceed to create a new one.
                        </p>
                    </div>
                </div>

                {/* Incoming lead summary */}
                <div>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                        Incoming lead
                    </p>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border">
                        <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center text-sm font-semibold text-success flex-shrink-0">
                            <User className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">{pendingLead.name || '—'}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                {pendingLead.phone && (
                                    <span className="flex items-center gap-1 text-xs text-muted">
                                        <Phone className="w-3 h-3" />
                                        {pendingLead.phone}
                                    </span>
                                )}
                                {pendingLead.email && (
                                    <span className="flex items-center gap-1 text-xs text-muted">
                                        <Mail className="w-3 h-3" />
                                        {pendingLead.email}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Duplicate matches */}
                <div>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                        Existing matches
                    </p>
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                        {matches.map((match) => (
                            <MatchCard
                                key={match.id}
                                match={match}
                                pendingLead={pendingLead}
                                onMerge={(targetId, fieldChoices) => onMerge && onMerge(targetId, fieldChoices)}
                            />
                        ))}
                    </div>
                </div>

                {/* Create new action */}
                <div className="pt-3 border-t border-border">
                    <button
                        type="button"
                        onClick={onCreateNew}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface hover:bg-surface-hover border border-border text-foreground rounded-xl text-sm font-medium transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Create as new lead anyway
                    </button>
                    <p className="text-[11px] text-muted text-center mt-2">
                        This will create a separate contact record. Duplicate data may result.
                    </p>
                </div>
            </div>
        </Modal>
    );
}
