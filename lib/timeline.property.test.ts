/**
 * Property-based tests for the Unified Contact Timeline pure helpers in
 * `lib/timeline.ts` (Module 11).
 *
 * These implement the following numbered design properties (design.md →
 * Correctness Properties → Unified Timeline):
 *
 *   - Property 50 — Timeline merge and ordering              (Req 14.1, 14.2)
 *   - Property 51 — Timeline type filter                     (Req 14.4)
 *   - Property 52 — Timeline pagination partitions entries   (Req 14.5)
 *
 * Only the pure, IO-free helpers are exercised here: `mergeTimeline` performs a
 * union of the per-source arrays then sorts them reverse-chronologically,
 * `filterByType` narrows a timeline to selected entry type(s), and `paginate`
 * (with `partitionPages`) splits an ordered timeline into pages. All tests run
 * with the project default of 100 iterations via `fcAssert`.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
    filterByType,
    mergeTimeline,
    paginate,
    partitionPages,
    type TimelineEntry,
    type TimelineEntryType,
} from '@/lib/timeline'
import { fcAssert } from '@/test/generators'

// ---------------------------------------------------------------------------
// Local arbitraries
// ---------------------------------------------------------------------------

/** Every concrete timeline entry type the service aggregates over (Req 14.1). */
const ENTRY_TYPES: readonly TimelineEntryType[] = [
    'call',
    'message',
    'email',
    'visit',
    'payment',
    'document',
    'deal_stage',
    'note',
]

const entryTypeArb: fc.Arbitrary<TimelineEntryType> = fc.constantFrom(...ENTRY_TYPES)

/**
 * A single timeline entry. Timestamps are drawn from a deliberately small
 * window so that ties (equal timestamps) are common, exercising the
 * deterministic id-descending tie-break in `mergeTimeline`.
 */
const entryArb: fc.Arbitrary<TimelineEntry> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    type: entryTypeArb,
    timestamp: fc.integer({ min: 0, max: 50 }),
    description: fc.string(),
    performedBy: fc.option(fc.string(), { nil: null }),
})

/** An array of per-source entry arrays, occasionally including empty/null slots. */
const sourcesArb: fc.Arbitrary<Array<TimelineEntry[] | null | undefined>> = fc.array(
    fc.oneof(
        fc.array(entryArb, { maxLength: 12 }),
        fc.constant(null),
        fc.constant(undefined)
    ),
    { maxLength: 8 }
)

/** An already-ordered (merged) timeline of entries. */
const timelineArb: fc.Arbitrary<TimelineEntry[]> = fc
    .array(entryArb, { maxLength: 40 })
    .map((entries) => mergeTimeline([entries]))

/** A canonical multiset key so two collections can be compared order-independently. */
function multiset(entries: ReadonlyArray<TimelineEntry>): string[] {
    return entries.map((e) => JSON.stringify(e)).sort()
}

// ---------------------------------------------------------------------------
// Property 50: Timeline merge and ordering
// ---------------------------------------------------------------------------

// Feature: real-estate-crm, Property 50: Timeline merge and ordering
// Validates: Requirements 14.1, 14.2
describe('Property 50: Timeline merge and ordering', () => {
    it('contains exactly the union of all source events (no entry dropped or invented)', () => {
        fcAssert(
            fc.property(sourcesArb, (sources) => {
                const merged = mergeTimeline(sources)

                // The expected multiset is the concatenation of all non-null sources.
                const expected: TimelineEntry[] = []
                for (const source of sources) {
                    if (source) expected.push(...source)
                }

                expect(merged.length).toBe(expected.length)
                expect(multiset(merged)).toEqual(multiset(expected))
            })
        )
    })

    it('is sorted in non-increasing timestamp order, breaking ties by id descending', () => {
        fcAssert(
            fc.property(sourcesArb, (sources) => {
                const merged = mergeTimeline(sources)
                for (let i = 0; i + 1 < merged.length; i++) {
                    const a = merged[i]
                    const b = merged[i + 1]
                    // Newest first: timestamps never increase as we walk forward.
                    expect(a.timestamp).toBeGreaterThanOrEqual(b.timestamp)
                    // Deterministic tie-break: equal timestamps ⇒ id non-increasing.
                    if (a.timestamp === b.timestamp) {
                        expect(a.id >= b.id).toBe(true)
                    }
                }
            })
        )
    })

    it('does not mutate its inputs', () => {
        fcAssert(
            fc.property(sourcesArb, (sources) => {
                const snapshot = JSON.stringify(sources)
                mergeTimeline(sources)
                expect(JSON.stringify(sources)).toBe(snapshot)
            })
        )
    })
})

// ---------------------------------------------------------------------------
// Property 51: Timeline type filter
// ---------------------------------------------------------------------------

// Feature: real-estate-crm, Property 51: Timeline type filter
// Validates: Requirements 14.4
describe('Property 51: Timeline type filter', () => {
    it('returns only entries whose type is selected, preserving order, and includes every match', () => {
        fcAssert(
            fc.property(
                timelineArb,
                fc.uniqueArray(entryTypeArb, { minLength: 1, maxLength: ENTRY_TYPES.length }),
                (entries, selected) => {
                    const filtered = filterByType(entries, selected)
                    const allowed = new Set(selected)

                    // Soundness: every returned entry is of a selected type.
                    expect(filtered.every((e) => allowed.has(e.type))).toBe(true)

                    // Completeness: exactly the matching entries survive, in original order.
                    const expected = entries.filter((e) => allowed.has(e.type))
                    expect(filtered).toEqual(expected)
                }
            )
        )
    })

    it('treats a single type the same as a one-element selection', () => {
        fcAssert(
            fc.property(timelineArb, entryTypeArb, (entries, type) => {
                const single = filterByType(entries, type)
                expect(single.every((e) => e.type === type)).toBe(true)
                expect(single).toEqual(filterByType(entries, [type]))
            })
        )
    })

    it('returns a copy of all entries when no type is selected (null / undefined)', () => {
        fcAssert(
            fc.property(timelineArb, (entries) => {
                expect(filterByType(entries, null)).toEqual(entries)
                expect(filterByType(entries, undefined)).toEqual(entries)
            })
        )
    })
})

// ---------------------------------------------------------------------------
// Property 52: Timeline pagination partitions entries
// ---------------------------------------------------------------------------

// Feature: real-estate-crm, Property 52: Timeline pagination partitions entries
// Validates: Requirements 14.5
describe('Property 52: Timeline pagination partitions entries', () => {
    it('cursor-following pages concatenate back to the full ordered list exactly', () => {
        fcAssert(
            fc.property(
                timelineArb,
                fc.integer({ min: 1, max: 20 }),
                (entries, pageSize) => {
                    const collected: TimelineEntry[] = []
                    let cursor: number | null = 0
                    let guard = 0
                    const maxIterations = entries.length + 2

                    while (cursor !== null) {
                        const page = paginate(entries, pageSize, cursor)
                        collected.push(...page.items)

                        // hasMore and nextCursor agree with one another.
                        expect(page.hasMore).toBe(page.nextCursor !== null)
                        cursor = page.nextCursor

                        // Defensive: a correct paginate always terminates.
                        if (++guard > maxIterations) {
                            throw new Error('paginate did not terminate')
                        }
                    }

                    // Concatenation reproduces the input list with no dup/omission.
                    expect(collected).toEqual([...entries])
                }
            )
        )
    })

    it('partitionPages splits into pages of at most pageSize that concatenate exactly', () => {
        fcAssert(
            fc.property(
                timelineArb,
                fc.integer({ min: 1, max: 20 }),
                (entries, pageSize) => {
                    const pages = partitionPages(entries, pageSize)

                    // Every page respects the size bound...
                    expect(pages.every((p) => p.length <= pageSize)).toBe(true)
                    // ...and only the final page may be short (others are exactly full).
                    for (let i = 0; i + 1 < pages.length; i++) {
                        expect(pages[i].length).toBe(pageSize)
                    }

                    // Concatenation reproduces the input list exactly.
                    expect(pages.flat()).toEqual([...entries])
                }
            )
        )
    })

    it('rejects a non-positive or non-integer page size', () => {
        fcAssert(
            fc.property(
                timelineArb,
                fc.oneof(
                    fc.integer({ min: -50, max: 0 }),
                    fc.double({ min: 0.1, max: 9.9, noNaN: true, noDefaultInfinity: true })
                        .filter((n) => !Number.isInteger(n))
                ),
                (entries, badSize) => {
                    expect(() => paginate(entries, badSize)).toThrow()
                    expect(() => partitionPages(entries, badSize)).toThrow()
                }
            )
        )
    })
})
