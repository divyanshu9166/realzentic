/**
 * lib/task-recurrence.ts
 *
 * Pure helper for computing the next occurrence of a recurring task.
 * Deterministic — no clock reads; the current due date is passed in.
 */

export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'

export const TASK_RECURRENCES: TaskRecurrence[] = ['none', 'daily', 'weekly', 'monthly']

export function isRecurrence(v: unknown): v is TaskRecurrence {
    return typeof v === 'string' && (TASK_RECURRENCES as string[]).includes(v)
}

/**
 * Given a task's current due date and its recurrence, return the next due date,
 * or null when the task does not recur. Time-of-day is preserved.
 *
 * - daily   → +1 day
 * - weekly  → +7 days
 * - monthly → +1 calendar month (clamped to the month's last day, e.g. Jan 31
 *             → Feb 28/29) to avoid date overflow into the following month.
 */
export function nextDueDate(current: Date, recurrence: TaskRecurrence): Date | null {
    if (!(current instanceof Date) || Number.isNaN(current.getTime())) return null
    switch (recurrence) {
        case 'daily':
            return new Date(current.getTime() + 86_400_000)
        case 'weekly':
            return new Date(current.getTime() + 7 * 86_400_000)
        case 'monthly': {
            const d = new Date(current.getTime())
            const day = d.getDate()
            // Move to the 1st, advance the month, then clamp the day to that
            // month's length so e.g. Jan 31 + 1 month → Feb 28/29 (not Mar 3).
            d.setDate(1)
            d.setMonth(d.getMonth() + 1)
            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
            d.setDate(Math.min(day, lastDay))
            return d
        }
        case 'none':
        default:
            return null
    }
}
