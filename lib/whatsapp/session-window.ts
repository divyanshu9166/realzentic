/**
 * WhatsApp 24-hour customer service window — pure helpers.
 *
 * Meta only allows free-form (session) messages within 24 hours of the
 * contact's most recent *inbound* message. Outside that window the business
 * may only send pre-approved message templates (HSM).
 *
 * These helpers are pure and deterministic: "now" and the last-inbound instant
 * are passed in as epoch-millisecond numbers so the logic is fully testable.
 */

/** The WhatsApp customer-service session window, in hours. */
export const WHATSAPP_SESSION_WINDOW_HOURS = 24

const HOUR_MS = 3_600_000

/**
 * Whether the 24-hour session window is currently open — i.e. a free-form text
 * message is allowed.
 *
 * Open iff a valid last-inbound instant exists and the elapsed time since it is
 * strictly less than the window. A `null`/`undefined`/non-finite last-inbound
 * (the contact has never messaged us) is always closed. Future-dated inbound
 * timestamps (minor clock skew) are treated as open.
 *
 * @param lastInboundMs Epoch ms of the contact's most recent inbound message.
 * @param nowMs         Epoch ms of the current instant.
 * @param windowHours   Window length in hours (default 24).
 * @throws if `nowMs` or `windowHours` is not finite, or `windowHours` < 0.
 */
export function isSessionWindowOpen(
    lastInboundMs: number | null | undefined,
    nowMs: number,
    windowHours: number = WHATSAPP_SESSION_WINDOW_HOURS,
): boolean {
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
        throw new Error(`isSessionWindowOpen expects a finite nowMs, received: ${String(nowMs)}`)
    }
    if (typeof windowHours !== 'number' || !Number.isFinite(windowHours) || windowHours < 0) {
        throw new Error(`isSessionWindowOpen expects a finite non-negative windowHours, received: ${String(windowHours)}`)
    }
    if (typeof lastInboundMs !== 'number' || !Number.isFinite(lastInboundMs)) {
        return false
    }
    const elapsedMs = nowMs - lastInboundMs
    if (elapsedMs < 0) return true // future-dated (clock skew) → treat as just-received
    return elapsedMs < windowHours * HOUR_MS
}

/**
 * Milliseconds remaining before the session window closes, or 0 if it is
 * already closed (or never opened). Useful for "window closes in 3h" hints.
 */
export function sessionWindowRemainingMs(
    lastInboundMs: number | null | undefined,
    nowMs: number,
    windowHours: number = WHATSAPP_SESSION_WINDOW_HOURS,
): number {
    if (!isSessionWindowOpen(lastInboundMs, nowMs, windowHours)) return 0
    // Window is open, so lastInboundMs is a finite number here.
    const closeAt = (lastInboundMs as number) + windowHours * HOUR_MS
    return Math.max(0, closeAt - nowMs)
}

/**
 * Decide which WhatsApp send mode is permitted right now:
 *   - `text`     — window open, free-form allowed.
 *   - `template` — window closed, only an approved template may be sent.
 */
export function allowedSendMode(
    lastInboundMs: number | null | undefined,
    nowMs: number,
    windowHours: number = WHATSAPP_SESSION_WINDOW_HOURS,
): 'text' | 'template' {
    return isSessionWindowOpen(lastInboundMs, nowMs, windowHours) ? 'text' : 'template'
}
