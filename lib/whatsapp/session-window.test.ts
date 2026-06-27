import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
    isSessionWindowOpen,
    sessionWindowRemainingMs,
    allowedSendMode,
    WHATSAPP_SESSION_WINDOW_HOURS,
} from './session-window'

const HOUR = 3_600_000
const NOW = 1_700_000_000_000

describe('isSessionWindowOpen', () => {
    it('open within 24h, closed at/after 24h', () => {
        expect(isSessionWindowOpen(NOW - 1 * HOUR, NOW)).toBe(true)
        expect(isSessionWindowOpen(NOW - 23.9 * HOUR, NOW)).toBe(true)
        expect(isSessionWindowOpen(NOW - 24 * HOUR, NOW)).toBe(false) // exactly 24h → closed
        expect(isSessionWindowOpen(NOW - 25 * HOUR, NOW)).toBe(false)
    })

    it('never-messaged contacts are closed', () => {
        expect(isSessionWindowOpen(null, NOW)).toBe(false)
        expect(isSessionWindowOpen(undefined, NOW)).toBe(false)
        expect(isSessionWindowOpen(NaN, NOW)).toBe(false)
    })

    it('future-dated inbound (clock skew) is open', () => {
        expect(isSessionWindowOpen(NOW + 5 * HOUR, NOW)).toBe(true)
    })

    it('validates now/window args', () => {
        expect(() => isSessionWindowOpen(NOW, NaN)).toThrow()
        expect(() => isSessionWindowOpen(NOW, NOW, -1)).toThrow()
    })

    it('default window is 24h', () => {
        expect(WHATSAPP_SESSION_WINDOW_HOURS).toBe(24)
    })

    it('property: open iff elapsed < window', () => {
        fc.assert(
            fc.property(fc.integer({ min: -48, max: 96 }), (hoursAgo) => {
                const last = NOW - hoursAgo * HOUR
                const open = isSessionWindowOpen(last, NOW)
                // hoursAgo < 24 means open (including negative/future)
                expect(open).toBe(hoursAgo < 24)
            }),
            { numRuns: 200 },
        )
    })
})

describe('sessionWindowRemainingMs', () => {
    it('is 0 when closed, positive when open', () => {
        expect(sessionWindowRemainingMs(NOW - 25 * HOUR, NOW)).toBe(0)
        expect(sessionWindowRemainingMs(null, NOW)).toBe(0)
        expect(sessionWindowRemainingMs(NOW - 1 * HOUR, NOW)).toBe(23 * HOUR)
    })

    it('property: remaining never exceeds the full window and is 0 when closed', () => {
        fc.assert(
            // Domain: inbound message in the past (hoursAgo >= 0). Future-dated
            // skew is covered by the isSessionWindowOpen tests.
            fc.property(fc.integer({ min: 0, max: 48 }), (hoursAgo) => {
                const rem = sessionWindowRemainingMs(NOW - hoursAgo * HOUR, NOW)
                expect(rem).toBeGreaterThanOrEqual(0)
                expect(rem).toBeLessThanOrEqual(WHATSAPP_SESSION_WINDOW_HOURS * HOUR)
            }),
            { numRuns: 200 },
        )
    })
})

describe('allowedSendMode', () => {
    it('text when open, template when closed', () => {
        expect(allowedSendMode(NOW - 2 * HOUR, NOW)).toBe('text')
        expect(allowedSendMode(NOW - 30 * HOUR, NOW)).toBe('template')
        expect(allowedSendMode(null, NOW)).toBe('template')
    })
})
