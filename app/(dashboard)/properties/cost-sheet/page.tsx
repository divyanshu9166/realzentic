/**
 * Cost Sheet & Payment Plan Builder page (Req 3.1, 3.10, 3.11).
 *
 * Server component: loads the project cards (`listProjects`, Req 1.6) and a
 * lightweight buyer list (`listContactsBrief`) used to populate the builder's
 * project/unit/buyer selectors, then hands off to the interactive
 * `CostSheetClient`, which owns:
 *   - the itemized cost-sheet builder form (Req 3.1),
 *   - PDF preview / generate (Req 3.9),
 *   - WhatsApp / Email share actions with observable delivery status (Req 3.10),
 *   - the payment-plan editor with milestone definitions (Req 3.11).
 *
 * Requirements: 3.1, 3.10, 3.11
 */

import { FileText } from 'lucide-react';
import { listProjects } from '@/app/actions/properties';
import { listContactsBrief } from '@/app/actions/contacts';
import CostSheetClient, {
    type ProjectOption,
    type ContactOption,
} from './CostSheetClient';

export const dynamic = 'force-dynamic';

export default async function CostSheetPage() {
    const [projectsRes, contactsRes] = await Promise.all([
        listProjects(),
        listContactsBrief(),
    ]);

    const projects: ProjectOption[] = projectsRes.success
        ? projectsRes.data.map((p) => ({ id: p.id, name: p.name, city: p.city }))
        : [];

    const contacts: ContactOption[] = contactsRes.success
        ? contactsRes.data.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))
        : [];

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-accent" />
                        <h1 className="text-xl md:text-2xl font-bold text-foreground">
                            Cost Sheet &amp; Payment Plans
                        </h1>
                    </div>
                    <p className="mt-1 text-xs md:text-sm text-muted">
                        Build itemized cost sheets for a unit and buyer, generate a branded PDF,
                        share it over WhatsApp or Email, and define payment plans.
                    </p>
                </div>
            </div>

            {!projectsRes.success ? (
                <div className="glass-card py-16 text-center text-muted">
                    <p className="font-medium">Could not load projects</p>
                    <p className="mt-1 text-sm">
                        {projectsRes.error ?? 'Please refresh the page to try again.'}
                    </p>
                </div>
            ) : (
                <CostSheetClient projects={projects} contacts={contacts} />
            )}
        </div>
    );
}
