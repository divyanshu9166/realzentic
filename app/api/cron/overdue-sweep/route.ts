/**
 * app/api/cron/overdue-sweep/route.ts
 *
 * Scheduled route that flips unpaid, past-due BookingMilestones to `Overdue`
 * and notifies the assigned manager via the existing Notification model.
 *
 * Intended to be hit by a system cron (or a BullMQ repeatable job) on a daily
 * cadence. The route:
 *   1. Optionally validates a Bearer secret (CRON_SECRET env var), so it can
 *      only be triggered by the scheduler — not by arbitrary HTTP clients.
 *   2. Calls `sweepOverdueMilestones()` which re-derives each unpaid
 *      milestone's status, persists the `Overdue` transition idempotently, and
 *      notifies managers per newly-overdue milestone (Req 9.4).
 *   3. Returns a JSON summary so the scheduler can log the outcome.
 *
 * If Redis / BullMQ is unavailable the action is called inline so the route is
 * always functional even without a message-queue.
 *
 * Requirements: 9.4 (set unpaid past-due milestones to Overdue and notify).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sweepOverdueMilestones } from '@/app/actions/deals'

// ---------------------------------------------------------------------------
// Security guard
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) {
        // No secret configured — allow execution (dev / VPS direct-call mode).
        return true
    }
    const authHeader = req.headers.get('authorization')
    return authHeader === `Bearer ${secret}`
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/cron/overdue-sweep
 *
 * Trigger the overdue-milestone sweep. Can be called directly by a cron daemon
 * or a BullMQ repeatable job that hits this URL.
 */
export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Run the sweep. `sweepOverdueMilestones` is idempotent — only
        // milestones that newly transition into `Overdue` are updated and
        // trigger a manager notification (Req 9.4).
        const result = await sweepOverdueMilestones()

        if (!result.success || !result.data) {
            console.error('[cron/overdue-sweep] sweepOverdueMilestones failed:', result)
            return NextResponse.json(
                { success: false, error: 'Overdue sweep failed' },
                { status: 500 },
            )
        }

        console.log(
            `[cron/overdue-sweep] sweptCount=${result.data.sweptCount} ` +
            `milestoneIds=[${result.data.milestoneIds.join(',')}]`,
        )

        return NextResponse.json({
            success: true,
            sweptCount: result.data.sweptCount,
            milestoneIds: result.data.milestoneIds,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error'
        console.error('[cron/overdue-sweep] unhandled error:', err)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}

/**
 * POST /api/cron/overdue-sweep
 *
 * Accepts the same request as GET. Some cron services (and BullMQ HTTP
 * workers) prefer POST. Both methods are equivalent here.
 */
export async function POST(req: NextRequest) {
    return GET(req)
}
