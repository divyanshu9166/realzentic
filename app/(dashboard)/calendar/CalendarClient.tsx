'use client'

/**
 * Unified calendar — month grid merging appointments, site visits, tasks and
 * payment-milestone due dates from `getCalendarEvents`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, CalendarDays } from 'lucide-react'
import { getCalendarEvents, type CalendarEvent, type CalendarEventType } from '@/app/actions/calendar'

const TYPE_META: Record<CalendarEventType, { label: string; dot: string; chip: string }> = {
    appointment: { label: 'Appointments', dot: 'bg-blue-500', chip: 'bg-blue-500/10 text-blue-700' },
    'site-visit': { label: 'Site Visits', dot: 'bg-amber-500', chip: 'bg-amber-500/10 text-amber-700' },
    task: { label: 'Tasks', dot: 'bg-purple-500', chip: 'bg-purple-500/10 text-purple-700' },
    payment: { label: 'Payments Due', dot: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-700' },
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CalendarClient() {
    const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedDay, setSelectedDay] = useState<string | null>(null)

    const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor])
    const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1), [cursor])

    const load = useCallback(async () => {
        setLoading(true)
        const res = await getCalendarEvents({ start: monthStart.toISOString(), end: monthEnd.toISOString() })
        if (res.success) setEvents(res.data)
        setLoading(false)
    }, [monthStart, monthEnd])

    useEffect(() => { load() }, [load])

    // Group events by day.
    const byDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>()
        for (const e of events) {
            const key = ymd(new Date(e.date))
            const arr = map.get(key) ?? []
            arr.push(e)
            map.set(key, arr)
        }
        return map
    }, [events])

    // Build the 6-week grid starting on the Sunday on/before the 1st.
    const cells = useMemo(() => {
        const firstDow = monthStart.getDay()
        const gridStart = new Date(monthStart)
        gridStart.setDate(gridStart.getDate() - firstDow)
        const days: Date[] = []
        for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart)
            d.setDate(gridStart.getDate() + i)
            days.push(d)
        }
        return days
    }, [monthStart])

    const todayKey = ymd(new Date())
    const monthLabel = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
    const selectedEvents = selectedDay ? (byDay.get(selectedDay) ?? []) : []

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10"><CalendarDays className="size-5 text-accent" /></div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Calendar</h1>
                        <p className="text-sm text-muted">Appointments, site visits, tasks and payment due dates in one view.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-2 rounded-lg border border-border hover:bg-surface-hover"><ChevronLeft className="size-4" /></button>
                    <span className="text-sm font-semibold text-foreground w-36 text-center">{monthLabel}</span>
                    <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-2 rounded-lg border border-border hover:bg-surface-hover"><ChevronRight className="size-4" /></button>
                    <button onClick={() => setCursor(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })} className="px-3 py-2 rounded-lg border border-border text-xs hover:bg-surface-hover">Today</button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3">
                {Object.entries(TYPE_META).map(([k, m]) => (
                    <span key={k} className="flex items-center gap-1.5 text-xs text-muted">
                        <span className={`size-2.5 rounded-full ${m.dot}`} /> {m.label}
                    </span>
                ))}
            </div>

            <div className="glass-card p-3">
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin text-accent" /></div>
                ) : (
                    <>
                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {WEEKDAYS.map((d) => <div key={d} className="text-center text-[11px] font-medium text-muted py-1">{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {cells.map((d) => {
                                const key = ymd(d)
                                const inMonth = d.getMonth() === cursor.getMonth()
                                const dayEvents = byDay.get(key) ?? []
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedDay(key)}
                                        className={`min-h-[88px] rounded-lg border p-1.5 text-left transition-colors ${inMonth ? 'border-border bg-surface' : 'border-transparent bg-transparent opacity-50'} ${selectedDay === key ? 'ring-2 ring-accent' : 'hover:bg-surface-hover'}`}
                                    >
                                        <span className={`text-xs font-medium ${key === todayKey ? 'flex size-5 items-center justify-center rounded-full bg-accent text-white' : 'text-foreground'}`}>{d.getDate()}</span>
                                        <div className="mt-1 space-y-0.5">
                                            {dayEvents.slice(0, 3).map((e) => (
                                                <div key={e.id} className={`truncate rounded px-1 py-0.5 text-[10px] ${TYPE_META[e.type].chip}`} title={e.title}>
                                                    {e.title}
                                                </div>
                                            ))}
                                            {dayEvents.length > 3 && <div className="text-[10px] text-muted px-1">+{dayEvents.length - 3} more</div>}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Selected day agenda */}
            {selectedDay && (
                <div className="glass-card p-4">
                    <h2 className="text-sm font-semibold text-foreground mb-3">
                        {new Date(selectedDay).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h2>
                    {selectedEvents.length === 0 ? (
                        <p className="text-sm text-muted">No events.</p>
                    ) : (
                        <div className="space-y-2">
                            {selectedEvents.map((e) => (
                                <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-surface">
                                    <span className={`size-2.5 rounded-full shrink-0 ${TYPE_META[e.type].dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                                        {e.subtitle && <p className="text-xs text-muted truncate">{e.subtitle}</p>}
                                    </div>
                                    <div className="text-right shrink-0">
                                        {e.time && <p className="text-xs text-foreground">{e.time}</p>}
                                        {e.status && <p className="text-[10px] text-muted">{e.status}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
