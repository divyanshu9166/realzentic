/**
 * app/api/cron/recalc-deals/route.ts
 *
 * Daily scheduled route that recalculates the AI deal-probability score for
 * every deal in the pipeline.
 *
 * Intended to be hit by a system cron (or a BullMQ scheduler) once per
 * calendar day. The route:
 *   1. Optionally validates a Bearer secret (CRON_SECRET env var), so it can
 *      only be triggered by the scheduler — not by arbitrary HTTP clients.
 *   2. Enqueues a BullMQ job that calls `recalcAllDeals()`. If Redis /
 *      BullMQ is unavailable the action is called inline so the route is
 *      always functional even without a message-queue.
 *   3. Returns a JSON summary so the scheduler can log the outcome.
 *
 * Requirements: 17.7 (once per calendar day), 17.8 (retain last score on
 * per-deal failure, record error indication).
 */

import { NextRequest, NextResponse } from 'next/server'
import { recalcAllDeals } from '@/app/actions/ai-deal-predictor'
import { bridgeWaDealToCrm } from '@/app/actions/wa-deal-bridge'
import { prisma } from '@/lib/db'

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
 * GET /api/cron/recalc-deals
 *
 * Trigger the daily deal-score recalculation. Can be called directly by a
 * cron daemon or a BullMQ repeatable job that POSTs to this URL.
 */
export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // -----------------------------------------------------------------------
        // Step 0: Auto-bridge any won WaDeals that haven't been linked yet.
        // Best-effort: individual errors are logged but do not abort the run.
        // (Req: cron auto-bridge for status='won' && crm_deal_id IS NULL)
        // -----------------------------------------------------------------------
        try {
            const unlinkedWonDeals = await prisma.waDeal.findMany({
                where: { status: 'won', crm_deal_id: null },
                select: { id: true },
            })

            console.log(`[cron/recalc-deals] auto-bridge: ${unlinkedWonDeals.length} won WaDeal(s) pending`)

            await Promise.allSettled(
                unlinkedWonDeals.map(async (d) => {
                    try {
                        await bridgeWaDealToCrm(d.id)
                    } catch (bridgeErr) {
                        console.error(`[cron/recalc-deals] auto-bridge failed for WaDeal ${d.id}:`, bridgeErr)
                    }
                }),
            )
        } catch (autoErr) {
            console.error('[cron/recalc-deals] auto-bridge sweep failed (non-fatal):', autoErr)
        }

        // Run the recalculation. `recalcAllDeals` is designed to:
        //   • Score each deal independently (failures don't abort the run).
        //   • Retain the last good score for any deal that fails.
        //   • Create a failure-indication notification when one or more deals fail.
        // (Req 17.7, 17.8)
        const result = await recalcAllDeals()

        if (!result.success) {
            console.error('[cron/recalc-deals] recalcAllDeals returned failure:', result)
            return NextResponse.json(
                { success: false, error: 'Recalculation failed' },
                { status: 500 },
            )
        }

        console.log(
            `[cron/recalc-deals] run ${result.data.runId}: updated=${result.data.updated}, failed=${result.data.failed}`,
        )

        return NextResponse.json({
            success: true,
            runId: result.data.runId,
            startedAt: result.data.startedAt,
            finishedAt: result.data.finishedAt,
            updated: result.data.updated,
            failed: result.data.failed,
            errors: result.data.errors,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error'
        console.error('[cron/recalc-deals] unhandled error:', err)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}

/**
 * POST /api/cron/recalc-deals
 *
 * Accepts the same request as GET. Some cron services (and BullMQ HTTP
 * workers) prefer POST. Both methods are equivalent here.
 */
export async function POST(req: NextRequest) {
    return GET(req)
}
