/**
 * Documents & KYC page (Req 8.7, 8.8).
 *
 * Server component: loads the document repository, KYC records, document
 * templates, and the set of documents whose expiry falls within the default
 * alert window via `listExpiringDocuments`. The interactive surface (tabs,
 * drag-and-drop upload, expiry alerts, KYC center, template manager) lives in
 * the client `DocumentsClient`, which wires every mutation back to the
 * `Document_Service` server actions in `app/actions/documents.ts`.
 */

import { prisma } from '@/lib/db';
import { listExpiringDocuments } from '@/app/actions/documents';
import { listContactsBrief } from '@/app/actions/contacts';
import { DEFAULT_EXPIRY_WINDOW_DAYS } from '@/lib/documents';
import DocumentsClient, {
    type DocumentRow,
    type KycRow,
    type TemplateRow,
    type ContactOption,
} from './DocumentsClient';

export const dynamic = 'force-dynamic';

function toISO(value: Date | null | undefined): string | null {
    return value ? new Date(value).toISOString() : null;
}

export default async function DocumentsPage() {
    const [documents, templates, kycRecords, expiringRes, contactsRes] = await Promise.all([
        prisma.document.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
        prisma.documentTemplate.findMany({ orderBy: { name: 'asc' } }),
        prisma.kYCRecord.findMany({
            orderBy: { id: 'desc' },
            take: 500,
            include: { contact: { select: { name: true } } },
        }),
        listExpiringDocuments(DEFAULT_EXPIRY_WINDOW_DAYS),
        listContactsBrief(),
    ]);

    const documentRows: DocumentRow[] = documents.map((d) => ({
        id: d.id,
        entityType: d.entityType,
        entityId: d.entityId,
        type: d.type,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        fileSize: d.fileSize,
        status: d.status,
        notes: d.notes,
        expiryDate: toISO(d.expiryDate),
        createdAt: toISO(d.createdAt) ?? new Date().toISOString(),
    }));

    const templateRows: TemplateRow[] = templates.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        category: t.category,
        htmlBody: t.htmlBody,
        header: t.header,
        footer: t.footer,
        isDefault: t.isDefault,
    }));

    const kycRows: KycRow[] = kycRecords.map((k) => ({
        id: k.id,
        contactId: k.contactId,
        contactName: k.contact?.name ?? `Contact ${k.contactId}`,
        documentType: k.documentType,
        documentNumber: k.documentNumber,
        verified: k.verified,
        autoVerified: k.autoVerified,
        verifiedAt: toISO(k.verifiedAt),
    }));

    const expiringIds = expiringRes.success ? expiringRes.data.map((d) => d.id) : [];
    const contacts: ContactOption[] = contactsRes.success
        ? (contactsRes.data as ContactOption[])
        : [];

    return (
        <DocumentsClient
            initialDocuments={documentRows}
            templates={templateRows}
            kycRecords={kycRows}
            contacts={contacts}
            initialExpiringIds={expiringIds}
            initialWindowDays={DEFAULT_EXPIRY_WINDOW_DAYS}
        />
    );
}
