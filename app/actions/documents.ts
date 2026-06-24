'use server'

/**
 * Document_Service — server actions for Document Management & KYC (Module 5).
 *
 * Backs Requirements 8.1–8.7 and 20.4. Pure logic (size/type gate, merge-field
 * resolution, expiry-window predicate) lives in `lib/documents.ts`; this module
 * wires those helpers to Prisma persistence, local `uploads/` file storage
 * (`lib/r2.ts`), and server-side PDF generation (`jspdf`).
 *
 *   - uploadDocument        — store an uploaded file under `uploads/`, auto-
 *                             categorize by type, persist a Document (Req 8.1–8.3).
 *   - createKycRecord       — persist a KYCRecord linked to a Contact (Req 8.4).
 *   - upsertDocumentTemplate— create/update a DocumentTemplate (Req 8.5).
 *   - generateFromTemplate  — render a template to a PDF, rejecting any
 *                             unresolved merge field (Req 8.6).
 *   - listExpiringDocuments — documents expiring within the alert window (Req 8.7).
 */

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth-helpers'
import { uploadFile } from '@/lib/r2'
import {
    validateUpload,
    resolveMergeFields,
    isWithinExpiryWindow,
    DEFAULT_EXPIRY_WINDOW_DAYS,
    MIN_EXPIRY_WINDOW_DAYS,
    MAX_EXPIRY_WINDOW_DAYS,
    type UploadRejectionReason,
} from '@/lib/documents'

// ─── Shared types ──────────────────────────────────────

type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string }

/** Entity types a document may be attached to (Req 8.1, 8.8). */
const ALLOWED_ENTITY_TYPES = ['Contact', 'Deal', 'Project', 'Booking'] as const
type EntityType = (typeof ALLOWED_ENTITY_TYPES)[number]

/** Human-readable rejection messages for upload validation (Req 8.3). */
const UPLOAD_REJECTION_MESSAGES: Record<UploadRejectionReason, string> = {
    EMPTY_FILE: 'File is empty (minimum size is 1 byte)',
    TOO_LARGE: 'File exceeds the maximum size of 25 MB',
    INVALID_SIZE: 'File size is invalid',
    DISALLOWED_TYPE: 'File type is not accepted',
}

// ─── Helpers ───────────────────────────────────────────

/** Sanitize a document type into a safe storage-folder segment. */
function categorizeFolder(type: string): string {
    const safe = type
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return safe || 'uncategorized'
}

function isPositiveInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

/** Strip HTML tags and decode a small set of entities for plain-text PDF output. */
function htmlToPlainText(html: string): string {
    return html
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\s*\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

// ─── uploadDocument (Req 8.1, 8.2, 8.3, 20.4) ──────────

export async function uploadDocument(
    entityType: string,
    entityId: number,
    type: string,
    file: File,
    options: { notes?: string; expiryDate?: string | Date | null } = {}
): Promise<ActionResult<Awaited<ReturnType<typeof prisma.document.create>>>> {
    try {
        const session = await requireAuth()

        // Required-field / enum validation before any write (Req 20.4).
        if (!ALLOWED_ENTITY_TYPES.includes(entityType as EntityType)) {
            return { success: false, error: `Invalid entityType: ${String(entityType)}` }
        }
        if (!isPositiveInt(entityId)) {
            return { success: false, error: 'entityId must be a positive integer' }
        }
        if (!isNonEmptyString(type)) {
            return { success: false, error: 'Document type is required' }
        }
        if (!file || typeof (file as File).arrayBuffer !== 'function') {
            return { success: false, error: 'A file is required' }
        }

        // Size + MIME allow-list gate (Req 8.2, 8.3).
        const gate = validateUpload(file.size, file.type)
        if (!gate.ok) {
            const reason = gate.reason ?? 'INVALID_SIZE'
            return { success: false, error: UPLOAD_REJECTION_MESSAGES[reason] }
        }

        let expiryDate: Date | null = null
        if (options.expiryDate != null && options.expiryDate !== '') {
            const parsed = new Date(options.expiryDate)
            if (Number.isNaN(parsed.getTime())) {
                return { success: false, error: 'expiryDate is not a valid date' }
            }
            expiryDate = parsed
        }

        // Store under uploads/, auto-categorized by selected type (Req 8.2).
        const buffer = Buffer.from(await file.arrayBuffer())
        const folder = `documents/${categorizeFolder(type)}`
        const fileUrl = await uploadFile(buffer, file.name || 'document', file.type, folder)

        const document = await prisma.document.create({
            data: {
                entityType,
                entityId,
                type,
                fileUrl,
                fileName: file.name || 'document',
                fileSize: file.size,
                status: 'Pending',
                uploadedById: session.user.staffId ?? null,
                notes: options.notes ?? null,
                expiryDate,
            },
        })

        revalidatePath('/documents')
        return { success: true, data: document }
    } catch (error) {
        console.error('Error uploading document:', error)
        return { success: false, error: 'Failed to upload document' }
    }
}

// ─── createKycRecord (Req 8.4, 20.4) ───────────────────

export async function createKycRecord(
    contactId: number,
    data: {
        documentType: string
        documentNumber: string
        frontImage?: string | null
        backImage?: string | null
        verified?: boolean
        autoVerified?: boolean
    }
): Promise<ActionResult<Awaited<ReturnType<typeof prisma.kYCRecord.create>>>> {
    try {
        const session = await requireAuth()

        if (!isPositiveInt(contactId)) {
            return { success: false, error: 'contactId must be a positive integer' }
        }
        if (!isNonEmptyString(data?.documentType)) {
            return { success: false, error: 'documentType is required' }
        }
        if (!isNonEmptyString(data?.documentNumber)) {
            return { success: false, error: 'documentNumber is required' }
        }

        // Referential integrity: the Contact must exist (Req 20.4, 20.8).
        const contact = await prisma.contact.findUnique({ where: { id: contactId } })
        if (!contact) {
            return { success: false, error: `Contact ${contactId} not found` }
        }

        const verified = data.verified === true
        const kyc = await prisma.kYCRecord.create({
            data: {
                contactId,
                documentType: data.documentType,
                documentNumber: data.documentNumber,
                frontImage: data.frontImage ?? null,
                backImage: data.backImage ?? null,
                verified,
                verifiedById: verified ? session.user.staffId ?? null : null,
                verifiedAt: verified ? new Date() : null,
                autoVerified: data.autoVerified === true,
            },
        })

        revalidatePath('/documents')
        return { success: true, data: kyc }
    } catch (error) {
        console.error('Error creating KYC record:', error)
        return { success: false, error: 'Failed to create KYC record' }
    }
}

// ─── upsertDocumentTemplate (Req 8.5, 20.4) ────────────

export async function upsertDocumentTemplate(data: {
    id?: number
    name: string
    type: string
    category: string
    htmlBody: string
    header?: string | null
    footer?: string | null
    isDefault?: boolean
}): Promise<ActionResult<Awaited<ReturnType<typeof prisma.documentTemplate.create>>>> {
    try {
        await requireAuth()

        if (!isNonEmptyString(data?.name)) {
            return { success: false, error: 'Template name is required' }
        }
        if (!isNonEmptyString(data?.type)) {
            return { success: false, error: 'Template type is required' }
        }
        if (!isNonEmptyString(data?.category)) {
            return { success: false, error: 'Template category is required' }
        }
        if (!isNonEmptyString(data?.htmlBody)) {
            return { success: false, error: 'Template htmlBody is required' }
        }

        const payload = {
            name: data.name,
            type: data.type,
            category: data.category,
            htmlBody: data.htmlBody,
            header: data.header ?? null,
            footer: data.footer ?? null,
            isDefault: data.isDefault === true,
        }

        let template
        if (data.id != null) {
            if (!isPositiveInt(data.id)) {
                return { success: false, error: 'Template id must be a positive integer' }
            }
            const existing = await prisma.documentTemplate.findUnique({ where: { id: data.id } })
            if (!existing) {
                return { success: false, error: `Template ${data.id} not found` }
            }
            template = await prisma.documentTemplate.update({
                where: { id: data.id },
                data: payload,
            })
        } else {
            template = await prisma.documentTemplate.create({ data: payload })
        }

        revalidatePath('/documents')
        return { success: true, data: template }
    } catch (error) {
        console.error('Error upserting document template:', error)
        return { success: false, error: 'Failed to save document template' }
    }
}

// ─── generateFromTemplate (Req 8.6) ────────────────────

export async function generateFromTemplate(
    templateId: number,
    mergeValues: Record<string, unknown> | null | undefined
): Promise<ActionResult<{ pdfUrl: string }>> {
    try {
        await requireAuth()

        if (!isPositiveInt(templateId)) {
            return { success: false, error: 'templateId must be a positive integer' }
        }

        const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } })
        if (!template) {
            return { success: false, error: `Template ${templateId} not found` }
        }

        // Resolve every {{merge field}} across header + body + footer (Req 8.6).
        const composite = [template.header ?? '', template.htmlBody, template.footer ?? '']
            .filter((part) => part.length > 0)
            .join('\n')

        const resolution = resolveMergeFields(composite, mergeValues)
        if (!resolution.ok) {
            const missing = resolution.missing ?? []
            return {
                success: false,
                error: `Cannot generate document: unresolved merge field(s): ${missing.join(', ')}`,
            }
        }

        // Render the resolved template to a PDF (server-side jspdf).
        const { jsPDF } = await import('jspdf')
        const doc = new jsPDF({ unit: 'mm', format: 'a4' })
        const marginX = 15
        const marginY = 20
        const pageWidth = doc.internal.pageSize.getWidth()
        const pageHeight = doc.internal.pageSize.getHeight()
        const usableWidth = pageWidth - marginX * 2
        const lineHeight = 6

        doc.setFontSize(11)
        const text = htmlToPlainText(resolution.resolved ?? '')
        const lines = doc.splitTextToSize(text, usableWidth) as string[]

        let cursorY = marginY
        for (const line of lines) {
            if (cursorY > pageHeight - marginY) {
                doc.addPage()
                cursorY = marginY
            }
            doc.text(line, marginX, cursorY)
            cursorY += lineHeight
        }

        const pdfBuffer = Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
        const fileName = `${categorizeFolder(template.name)}-${Date.now()}.pdf`
        const pdfUrl = await uploadFile(pdfBuffer, fileName, 'application/pdf', 'documents/generated')

        return { success: true, data: { pdfUrl } }
    } catch (error) {
        console.error('Error generating document from template:', error)
        return { success: false, error: 'Failed to generate document from template' }
    }
}

// ─── listExpiringDocuments (Req 8.7) ───────────────────

export async function listExpiringDocuments(
    windowDays: number = DEFAULT_EXPIRY_WINDOW_DAYS
): Promise<ActionResult<Awaited<ReturnType<typeof prisma.document.findMany>>>> {
    try {
        await requireAuth()

        if (
            typeof windowDays !== 'number' ||
            !Number.isInteger(windowDays) ||
            windowDays < MIN_EXPIRY_WINDOW_DAYS ||
            windowDays > MAX_EXPIRY_WINDOW_DAYS
        ) {
            return {
                success: false,
                error: `windowDays must be an integer in [${MIN_EXPIRY_WINDOW_DAYS}, ${MAX_EXPIRY_WINDOW_DAYS}]`,
            }
        }

        const now = new Date()

        // Narrow at the DB level, then apply the exact day-window predicate.
        const upperBound = new Date(now.getTime())
        upperBound.setDate(upperBound.getDate() + windowDays + 1)

        const candidates = await prisma.document.findMany({
            where: {
                expiryDate: { not: null, lte: upperBound },
                status: { not: 'Expired' },
            },
            orderBy: { expiryDate: 'asc' },
        })

        const expiring = candidates.filter(
            (d) => d.expiryDate != null && isWithinExpiryWindow(d.expiryDate, now, windowDays)
        )

        return { success: true, data: expiring }
    } catch (error) {
        console.error('Error listing expiring documents:', error)
        return { success: false, error: 'Failed to list expiring documents' }
    }
}
