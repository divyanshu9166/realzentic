/**
 * Unified Contact Timeline pure helpers (Module 11).
 *
 * Every function in this module is PURE: it performs no DB/IO, does not read
 * the global clock, and does not mutate its inputs. The service layer
 * (`app/actions/timeline.ts`) is responsible for fetching raw rows from the
 * various sources (calls, messages, emails, visits, payments, documents,
 * deal-stage changes, notes) and mapping them into `TimelineEntry` values;
 * these helpers then merge, filter, and paginate that data deterministically.
 *
 * Requirements:
 *   - 14.1 — Aggregate (union) entries from all sources for a contact.
 *   - 14.2 — Return entries sorted in reverse-chronological order (newest first).
 *   - 14.4 — Filter the timeline by entry type.
 *   - 14.5 — Paginate results to support infinite scroll.
 */

/**
 * The kind of interaction a timeline entry represents. Mirrors the sources the
 * Timeline_Service aggregates over (Req 14.1).
 */
export type TimelineEntryType =
    | 'call'
    | 'message'
    | 'email'
    | 'visit'
    | 'payment'
    | 'document'
    | 'deal_stage'
    | 'note'

/**
 * A single, source-agnostic timeline entry. Each concrete source row is mapped
 * into this shape by the service layer before merging.
 */
export interface TimelineEntry {
    /** Stable, globally-unique id (e.g. `"call:123"`). Used as a deterministic tie-breaker. */
    id: string
    /** The interaction type, used for filtering (Req 14.4). */
    type: TimelineEntryType
    /** Event time as epoch milliseconds. Used for reverse-chronological ordering (Req 14.2). */
    timestamp: number
    /** Human-readable summary of the entry. */
    description: string
    /** Who performed/triggered the entry (staff name/id), or `null` when system-generated. */
    performedBy: string | null
    /** Optional source-specific extra fields for rendering (icon, badge, links, ...). */
    metadata?: Record<string, unknown>
}

/** A single page of timeline entries plus the cursor needed to fetch the next page. */
export interface TimelinePage {
    /** The entries belonging to this page, preserving the input order. */
    items: TimelineEntry[]
    /**
     * Cursor (index into the ordered list) at which the next page begins, or
     * `null` when this is the last page.
     */
    nextCursor: number | null
    /** Whether more entries remain after this page. */
    hasMore: boolean
}

function assertPositiveInteger(value: number, name: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer, received: ${String(value)}`)
    }
}

/**
 * Merge multiple source arrays into a single timeline, sorted in
 * reverse-chronological (non-increasing timestamp) order.
 *
 * The result is exactly the union of all input entries (no entry is dropped or
 * invented). Entries that share a timestamp are ordered by `id` descending so
 * the output is fully deterministic regardless of the host engine's sort
 * stability (design Property 50).
 *
 * The inputs are never mutated.
 *
 * Requirements: 14.1, 14.2.
 *
 * @param sources An array of per-source entry arrays. Falsy slots are ignored.
 * @returns A new array containing every input entry, newest first.
 */
export function mergeTimeline(
    sources: ReadonlyArray<ReadonlyArray<TimelineEntry> | null | undefined>
): TimelineEntry[] {
    const merged: TimelineEntry[] = []
    for (const source of sources) {
        if (!source) continue
        for (const entry of source) {
            merged.push(entry)
        }
    }

    merged.sort((a, b) => {
        if (b.timestamp !== a.timestamp) {
            return b.timestamp - a.timestamp
        }
        // Deterministic tie-break for equal timestamps: id descending.
        if (a.id === b.id) return 0
        return a.id < b.id ? 1 : -1
    })

    return merged
}

/**
 * Filter a timeline to only entries of the selected type(s).
 *
 * Every returned entry has a type included in `type` (design Property 51). The
 * relative order of the surviving entries is preserved, and the input is not
 * mutated. Passing `null`/`undefined` (no filter selected) returns a shallow
 * copy of all entries.
 *
 * Requirements: 14.4.
 *
 * @param entries The (typically already-merged) timeline entries.
 * @param type A single type, an array of types, or `null`/`undefined` for "all".
 */
export function filterByType(
    entries: ReadonlyArray<TimelineEntry>,
    type: TimelineEntryType | ReadonlyArray<TimelineEntryType> | null | undefined
): TimelineEntry[] {
    if (type == null) {
        return entries.slice()
    }
    const allowed = Array.isArray(type) ? new Set(type) : new Set([type])
    if (allowed.size === 0) {
        return entries.slice()
    }
    return entries.filter((entry) => allowed.has(entry.type))
}

/**
 * Return a single page of entries using a cursor (index-based) split, for
 * infinite scroll.
 *
 * `cursor` is the index into the ordered list at which this page begins
 * (`0` for the first page). The page contains up to `pageSize` entries; the
 * returned `nextCursor` points at the next unconsumed entry, or is `null` once
 * the list is exhausted. The input is not mutated.
 *
 * Successive calls — starting at cursor `0` and following each `nextCursor` —
 * yield pages whose concatenation reproduces the input list exactly, with no
 * duplicated or omitted entries (design Property 52).
 *
 * Requirements: 14.5.
 *
 * @throws if `pageSize` is not a positive integer.
 */
export function paginate(
    entries: ReadonlyArray<TimelineEntry>,
    pageSize: number,
    cursor: number = 0
): TimelinePage {
    assertPositiveInteger(pageSize, 'pageSize')

    // Clamp the cursor into a valid range so callers can't read out of bounds.
    const start = Math.max(0, Math.min(Math.trunc(cursor), entries.length))
    const end = Math.min(start + pageSize, entries.length)
    const items = entries.slice(start, end)
    const hasMore = end < entries.length

    return {
        items,
        nextCursor: hasMore ? end : null,
        hasMore,
    }
}

/**
 * Partition an ordered timeline into consecutive pages of at most `pageSize`
 * entries each.
 *
 * Concatenating the returned pages in order reproduces the input list exactly,
 * with no duplicated or omitted entries (design Property 52). An empty input
 * yields an empty array of pages. The input is not mutated.
 *
 * Requirements: 14.5.
 *
 * @throws if `pageSize` is not a positive integer.
 */
export function partitionPages(
    entries: ReadonlyArray<TimelineEntry>,
    pageSize: number
): TimelineEntry[][] {
    assertPositiveInteger(pageSize, 'pageSize')

    const pages: TimelineEntry[][] = []
    for (let i = 0; i < entries.length; i += pageSize) {
        pages.push(entries.slice(i, i + pageSize))
    }
    return pages
}
