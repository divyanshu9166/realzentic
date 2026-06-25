/**
 * app/api/cron/demand-letters/route.ts
 *
 * Scheduled route that generates demand letters for unpaid BookingMilestones
 * whose due date falls within the configured lead window, and (optionally)
 * dispatches each newly generated letter over WhatsApp + Email.
 *
 * Intended to be hit by a system cron (or a BullMQ repeatable job) on a daily
 * cadence. The route:
 *   1. Optionally validates a Bearer secret (CRON_SECRET env var), so it can
 *      only be triggered by the scheduler — not by arbitrary HTTP clients.
 *   2. Calls `generateDemandLetters(windowDays)` to create de-duplicated
 *      Demand_Letter rows (Req 9.1).
 *   3. Optionally calls `sendDemandLetter(letterId)` for each generated letter
 *      to dispatch it and record per-channel status (Req 9.2, 9.3).
 *   4. Returns a JSON summary so the scheduler can log the outcome.
 *
 * Query parameters (also accepted as overrides):
 *   - windowDays: the configured lead window in days (7, 15, or 30). Default 7.
 *   - send:       "false"/"0" to skip dispatch and only generate. Default: send.
 *
 * If Redis / BullMQ is unavailable the actions are called inline so the route
 * is always functional even without a message-queue.
 *
 * Requirements: 9.1 (generate within lead window, de-duplicate), 9.4 handled by
 * the sibling overdue-sweep route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateDemandLetters, sendDemandLetter } from '@/app/actions/deals'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default lead window (days) when none is supplied via the query string. */
const DEFAULT_WINDOW_DAYS = 7

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
 * GET /api/cron/demand-letters
 *
 * Generate (and optionally send) demand letters. Can be called directly by a
 * cron daemon or a BullMQ repeatable job that hits this URL.
 */
export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)

        // Resolve the lead window: query override → default. Validation of the
        // value itself is delegated to `generateDemandLetters`.
        const windowParam = searchParams.get('windowDays')
        const windowDays = windowParam !== null ? Number(windowParam) : DEFAULT_WINDOW_DAYS

        // Dispatch is on by default; "false"/"0" disables it (generate-only).
        const sendParam = (searchParams.get('send') ?? '').toLowerCase()
        const shouldSend = sendParam !== 'false' && sendParam !== '0'

        // Step 1: generate de-duplicated demand letters (Req 9.1).
        const genResult = await generateDemandLetters(windowDays)

        if (!genResult.success || !genResult.data) {
            console.error('[cron/demand-letters] generateDemandLetters failed:', genResult)
            return NextResponse.json(
                { success: false, error: genResult.error ?? 'Demand letter generation failed' },
                { status: 500 },
            )
        }

        const { generated, letterIds } = genResult.data

        // Step 2: optionally dispatch each newly generated letter (Req 9.2, 9.3).
        let sentCount = 0
        let sendFailedCount = 0
        if (shouldSend) {
            for (const letterId of letterIds) {
                const sendResult = await sendDemandLetter(letterId)
                if (sendResult.success) {
                    sentCount += 1
                } else {
                    sendFailedCount += 1
                    console.error(
                        `[cron/demand-letters] sendDemandLetter(${letterId}) failed:`,
                        sendResult.error,
                    )
                }
            }
        }

        console.log(
            `[cron/demand-letters] windowDays=${windowDays} generated=${generated} ` +
            `sent=${sentCount} sendFailed=${sendFailedCount} (send=${shouldSend})`,
        )

        return NextResponse.json({
            success: true,
            windowDays,
            generated,
            letterIds,
            send: shouldSend,
            sent: sentCount,
            sendFailed: sendFailedCount,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error'
        console.error('[cron/demand-letters] unhandled error:', err)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}

/**
 * POST /api/cron/demand-letters
 *
 * Accepts the same request as GET. Some cron services (and BullMQ HTTP
 * workers) prefer POST. Both methods are equivalent here.
 */
export async function POST(req: NextRequest) {
    return GET(req)
}
