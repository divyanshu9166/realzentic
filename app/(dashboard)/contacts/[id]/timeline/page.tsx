/**
 * Contact Timeline page (Req 14.3, 14.4, 14.5).
 *
 * Server component: loads the first page of the unified contact timeline via
 * `getContactTimeline` and passes it to the `ContactTimeline` client component
 * for rendering, type-filtering, and infinite-scroll pagination.
 *
 * URL: /contacts/[id]/timeline
 *
 * Requirements: 14.3, 14.4, 14.5
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import { getContactTimeline } from '@/app/actions/timeline';
import ContactTimeline from '@/components/ContactTimeline';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ContactTimelinePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const contactId = Number(id);

    if (!Number.isInteger(contactId) || contactId < 1) {
        notFound();
    }

    // Load the contact's basic info for the header.
    const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, name: true, phone: true, email: true },
    });

    if (!contact) {
        notFound();
    }

    // Fetch the first page of timeline entries on the server to avoid a
    // client-side loading flash (Req 14.5).
    const res = await getContactTimeline(contactId, 0);

    if (!res.success) {
        return (
            <div className="space-y-6">
                <Link
                    href="/leads"
                    className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover"
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </Link>
                <div className="glass-card py-16 text-center text-muted">
                    <p className="font-medium">Failed to load timeline</p>
                    <p className="mt-1 text-sm">{res.error ?? 'An unexpected error occurred.'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb / back link */}
            <Link
                href="/leads"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover"
            >
                <ArrowLeft className="h-4 w-4" /> Back to leads
            </Link>

            {/* Contact summary header */}
            <div className="glass-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-foreground">
                            {contact.name}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                            {contact.phone && <span>{contact.phone}</span>}
                            {contact.email && <span>{contact.email}</span>}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted">
                        <History className="h-4 w-4 text-accent" />
                        <span>
                            {res.data.items.length} entr{res.data.items.length === 1 ? 'y' : 'ies'}
                            {res.data.hasMore ? ' (more available)' : ''}
                        </span>
                    </div>
                </div>
            </div>

            {/* Timeline panel */}
            <div className="glass-card p-5">
                <div className="mb-5 flex items-center gap-2">
                    <History className="h-4 w-4 text-accent" />
                    <h2 className="text-base font-semibold text-foreground">Interaction Timeline</h2>
                </div>

                {/* Client component handles filter + infinite scroll */}
                <ContactTimeline
                    contactId={contactId}
                    initialPage={res.data}
                />
            </div>
        </div>
    );
}
