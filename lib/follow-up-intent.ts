/**
 * lib/follow-up-intent.ts
 *
 * Pure, deterministic parser that detects when a customer asks to be contacted
 * later (e.g. "call me after 10 days", "ping me next month") and resolves the
 * requested future date.
 *
 * To avoid false positives (e.g. "possession in 2 years" is about the property,
 * not a callback) a match requires BOTH:
 *   1. a contact/callback intent cue (call, contact, ping, reach, follow up, …)
 *   2. a future-timeframe expression (after N days/weeks/months, next month, …)
 *
 * Pure: "now" is passed in, so the resolved date is deterministic and testable.
 */

export interface FollowUpIntent {
    /** True when the message clearly asks to be contacted on a future date. */
    matched: boolean
    /** Resolved future date (now + offset), or null when not matched. */
    date: Date | null
    /** Whole-day offset that was detected, or null. */
    days: number | null
    /** The timeframe phrase that matched (for notes), or null. */
    phrase: string | null
}

const DAY_MS = 86_400_000

/** Maximum sensible callback horizon (~3 years) — guards against absurd values. */
const MAX_DAYS = 1095

// Intent cues that indicate the customer wants to be contacted later.
const INTENT_RE =
    /\b(call|contact|reach|ping|text|message|msg|revert|reconnect|connect|remind|get\s*back|follow[\s-]?up|circle\s*back)\b/i

// Small word-number map so "after two weeks" works alongside "after 2 weeks".
const WORD_NUMBERS: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    couple: 2, few: 3,
}

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 }

function toDays(n: number, unit: string): number {
    const u = unit.toLowerCase().replace(/s$/, '')
    return n * (UNIT_DAYS[u] ?? 0)
}

/**
 * Parse a customer message for a "contact me later" intent + timeframe.
 *
 * @param text Raw inbound message text.
 * @param now  Reference instant (kept injectable for deterministic tests).
 */
export function parseFollowUpIntent(text: string, now: Date): FollowUpIntent {
    const none: FollowUpIntent = { matched: false, date: null, days: null, phrase: null }
    if (typeof text !== 'string' || !text.trim()) return none

    const hasIntent = INTENT_RE.test(text)
    if (!hasIntent) return none

    const lower = text.toLowerCase()

    let days: number | null = null
    let phrase: string | null = null

    // 1. "after/in <number|word> day(s)/week(s)/month(s)/year(s)"
    const rel = lower.match(
        /\b(?:after|in|within)\s+(\d{1,4}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|few)\s*(?:of\s+)?(day|days|week|weeks|month|months|year|years)\b/,
    )
    if (rel) {
        const rawN = rel[1]
        const n = /^\d+$/.test(rawN) ? parseInt(rawN, 10) : WORD_NUMBERS[rawN] ?? 0
        const d = toDays(n, rel[2])
        if (d > 0) {
            days = d
            phrase = rel[0].trim()
        }
    }

    // 2. "next week/month/year"
    if (days == null) {
        const next = lower.match(/\bnext\s+(week|month|year)\b/)
        if (next) {
            days = UNIT_DAYS[next[1]] ?? null
            phrase = next[0].trim()
        }
    }

    // 3. "tomorrow" / "day after tomorrow"
    if (days == null) {
        if (/\bday\s+after\s+tomorrow\b/.test(lower)) {
            days = 2
            phrase = 'day after tomorrow'
        } else if (/\btomorrow\b/.test(lower)) {
            days = 1
            phrase = 'tomorrow'
        }
    }

    if (days == null || days <= 0) return none
    if (days > MAX_DAYS) days = MAX_DAYS

    const date = new Date(now.getTime() + days * DAY_MS)
    return { matched: true, date, days, phrase }
}
