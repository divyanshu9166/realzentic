/**
 * app/api/cron/whatsapp-reminders/route.ts
 *
 * Daily scheduled route that fires all proactive WhatsApp CRM reminders:
 *   - follow-up due reminders
 *   - upcoming site-visit reminders
 *   - post-visit feedback requests
 *   - upcoming payment-milestone reminders
 *
 * Each runner is independently toggled in the reminder config and is
 * idempotent per day, so re-hitting this route is safe. Protected by the
 * shared CRON_SECRET bearer (when configured), like the other cron routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
    runFollowUpReminders,
    runSiteVisitReminders,
    runPostVisitFeedback,
    runPaymentReminders,
} from '@/app/actions/reminders'

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return true // dev / direct-call mode
    return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Run sequentially so a single misconfigured account can't fan out
        // hundreds of concurrent Meta calls.
        const followUps = await runFollowUpReminders()
        const siteVisits = await runSiteVisitReminders()
        const postVisits = await runPostVisitFeedback()
        const payments = await runPaymentReminders()

        const summary = { followUps, siteVisits, postVisits, payments }
        console.log('[cron/whatsapp-reminders]', JSON.stringify(summary))
        return NextResponse.json({ success: true, summary })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error'
        console.error('[cron/whatsapp-reminders] unhandled error:', err)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    return GET(req)
}
