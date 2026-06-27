/**
 * WhatsApp Reminders settings page (ADMIN/MANAGER).
 *
 * Configure the proactive, 24h-window-aware WhatsApp reminders: follow-ups,
 * site visits, post-visit feedback, and payment milestones. Free-form text is
 * sent inside the 24h window; outside it the configured approved template is
 * used (templates must be approved in Meta first).
 */

import { MessageSquareDot, ShieldAlert } from 'lucide-react';
import { getSession } from '@/lib/auth-helpers';
import ReminderSettingsClient from './ReminderSettingsClient';

export default async function WhatsAppRemindersPage() {
    const session = await getSession();
    const role = session?.user?.role;
    const allowed = role === 'ADMIN' || role === 'MANAGER';

    return (
        <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
            <div className="flex items-center gap-2">
                <MessageSquareDot className="w-6 h-6 text-accent" />
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground">WhatsApp Reminders</h1>
                    <p className="text-xs md:text-sm text-muted mt-0.5">
                        Automatic, compliant WhatsApp nudges for follow-ups, visits, feedback, and payments.
                    </p>
                </div>
            </div>

            {allowed ? (
                <ReminderSettingsClient />
            ) : (
                <div className="glass-card py-16 text-center text-muted">
                    <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Restricted</p>
                    <p className="text-sm mt-1">Only managers and administrators can configure reminders.</p>
                </div>
            )}
        </div>
    );
}
