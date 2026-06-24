/**
 * Site Visit 2.0 page (Req 12.2–12.6).
 *
 * Server component: loads the reference data the agent workflow needs
 * (active field visits, staff, leads, deal stages, contacts) and hands it to
 * the client `SiteVisitClient`, which owns the OTP check-in, geo check-in,
 * structured-feedback, and analytics interactions wired to the
 * `app/actions/field-visits.ts` server actions.
 */

import { MapPinned } from 'lucide-react';
import { getFieldVisits } from '@/app/actions/field-visits';
import { getStaff } from '@/app/actions/staff';
import { getLeads } from '@/app/actions/leads';
import { listDealStages } from '@/app/actions/deals';
import { listContactsBrief } from '@/app/actions/contacts';
import SiteVisitClient, {
    type VisitItem,
    type StaffItem,
    type LeadItem,
    type StageItem,
    type ContactItem,
} from './SiteVisitClient';

export const dynamic = 'force-dynamic';

export default async function FieldVisitsPage() {
    const [visitsRes, staffRes, leadsRes, stagesRes, contactsRes] = await Promise.all([
        getFieldVisits(),
        getStaff(),
        getLeads(),
        listDealStages(),
        listContactsBrief(),
    ]);

    const visits: VisitItem[] = (visitsRes.success ? visitsRes.data ?? [] : []).map((v) => ({
        id: v.id,
        displayId: v.displayId,
        customer: v.customer,
        address: v.address,
        status: v.status,
        otpVerified: Boolean(v.otpVerified),
        checkedIn: v.geoCheckinTime != null,
        buyerRating: v.buyerRating ?? null,
        followUpAction: v.followUpAction ?? null,
        projectId: v.projectId ?? null,
        staffId: v.staffId,
        staffName: v.staff?.name ?? null,
    }));

    const staff: StaffItem[] = (staffRes.success ? staffRes.data : []).map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
    }));

    const leads: LeadItem[] = (leadsRes.success ? leadsRes.data : []).map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone ?? null,
    }));

    const stages: StageItem[] = (stagesRes.success ? stagesRes.data : []).map((s) => ({
        id: s.id,
        name: s.name,
        isWon: Boolean(s.isWon),
        isLost: Boolean(s.isLost),
    }));

    const contacts: ContactItem[] = (contactsRes.success ? contactsRes.data : []).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? null,
    }));

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <MapPinned className="h-5 w-5 text-accent" />
                        <h1 className="text-xl md:text-2xl font-bold text-foreground">Site Visits</h1>
                    </div>
                    <p className="mt-1 text-xs md:text-sm text-muted">
                        OTP-verified, geo-checked site visits with structured buyer feedback and analytics.
                    </p>
                </div>
            </div>

            <SiteVisitClient
                visits={visits}
                staff={staff}
                leads={leads}
                stages={stages}
                contacts={contacts}
            />
        </div>
    );
}
