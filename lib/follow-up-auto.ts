/**
 * lib/follow-up-auto.ts
 *
 * Server-side helper that turns a customer's "contact me later" message into a
 * Follow-up record. Called from the AI agent worker for WhatsApp inbound
 * messages (where the contact phone is a real E.164 number).
 *
 * Not a `'use server'` action — it's an internal server lib, so it is never
 * exposed as a callable client endpoint.
 */

import { prisma } from '@/lib/db'
import { normalizePhone } from '@/lib/dedup'
import { parseFollowUpIntent } from '@/lib/follow-up-intent'

export interface AutoFollowUpArgs {
    /** Customer phone in any format (E.164 expected from WhatsApp). */
    phone: string
    /** Display name to use if a CRM contact must be created. */
    name?: string | null
    /** The inbound message text to parse for intent. */
    messageText: string
    /** What the customer is interested in (defaults to a generic label). */
    interest?: string
    /** Channel/source label stored on the follow-up. */
    source?: string
}

export interface AutoFollowUpResult {
    created: boolean
    followUpId?: number
    date?: string
    reason?: string
}

/**
 * Find-or-create a CRM Contact by phone (mirrors createLead's dedup path).
 */
async function findOrCreateContact(phone: string, name?: string | null) {
    let contact = await prisma.contact.findFirst({ where: { phone } })
    if (!contact) {
        const normalized = normalizePhone(phone)
        if (normalized) {
            const candidates = await prisma.contact.findMany({ select: { id: true, phone: true } })
            const match = candidates.find((c) => normalizePhone(c.phone) === normalized)
            if (match) contact = await prisma.contact.findUnique({ where: { id: match.id } })
        }
    }
    if (!contact) {
        contact = await prisma.contact.create({
            data: { name: name?.trim() || phone, phone, source: 'WhatsApp' },
        })
    }
    return contact
}

/**
 * Detect a "contact me later" intent in `messageText` and, if found, create a
 * pending Follow-up for the contact. Idempotent-ish: skips when the contact
 * already has an open follow-up. Never throws.
 */
export async function maybeCreateFollowUpFromMessage(
    args: AutoFollowUpArgs,
): Promise<AutoFollowUpResult> {
    try {
        const intent = parseFollowUpIntent(args.messageText, new Date())
        if (!intent.matched || !intent.date) return { created: false, reason: 'no_intent' }

        if (!args.phone || !args.phone.trim()) return { created: false, reason: 'no_phone' }

        const contact = await findOrCreateContact(args.phone, args.name)

        // Don't stack follow-ups: skip if one is already open for this contact.
        const open = await prisma.followUpEntry.findFirst({
            where: { contactId: contact.id, status: { in: ['PENDING', 'CONTACTED', 'REMINDED'] } },
            select: { id: true },
        })
        if (open) return { created: false, reason: 'already_open' }

        const entry = await prisma.followUpEntry.create({
            data: {
                contactId: contact.id,
                interest: args.interest?.trim() || 'WhatsApp enquiry',
                followUpDate: intent.date,
                reason: intent.phrase
                    ? `Customer asked to be contacted ${intent.phrase}`
                    : 'Customer asked to be contacted later',
                status: 'PENDING',
                priority: 'Medium',
                source: args.source || 'WhatsApp',
            },
        })

        console.log(
            `[follow-up-auto] created follow-up ${entry.id} for ${args.phone} on ${intent.date.toISOString()}`,
        )
        return { created: true, followUpId: entry.id, date: intent.date.toISOString() }
    } catch (err) {
        console.error('[follow-up-auto] failed:', err)
        return { created: false, reason: 'error' }
    }
}
