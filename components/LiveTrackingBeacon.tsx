'use client';

/**
 * components/LiveTrackingBeacon.tsx
 *
 * Agent-side live-location beacon. When the agent toggles sharing on, the
 * browser's `geolocation.watchPosition` streams position updates; we throttle
 * them to one server ping every ~30s (or sooner if the agent has moved a
 * meaningful distance) and POST each ping via the `recordAgentLocation`
 * server action.
 *
 * Privacy: sharing is OFF by default and fully agent-controlled — nothing is
 * sent until the agent explicitly opts in, and toggling off stops the watch
 * immediately. The agent always sees their current status.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Radio, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { recordAgentLocation } from '@/app/actions/agent-tracking';

const MIN_PING_INTERVAL_MS = 30_000; // at most one ping per 30s

interface Props {
    /** Optional active site-visit id to tag pings with. */
    visitId?: number;
    className?: string;
}

type Status = 'idle' | 'sharing' | 'error';

export default function LiveTrackingBeacon({ visitId, className }: Props) {
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
    const [sending, setSending] = useState(false);

    const watchIdRef = useRef<number | null>(null);
    const lastPingMsRef = useRef<number>(0);
    const sendingRef = useRef(false);

    const stopWatch = useCallback(() => {
        if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = null;
    }, []);

    const pushPing = useCallback(
        async (pos: GeolocationPosition) => {
            const nowMs = Date.now();
            // Throttle: skip if we pinged too recently.
            if (nowMs - lastPingMsRef.current < MIN_PING_INTERVAL_MS) return;
            if (sendingRef.current) return;

            sendingRef.current = true;
            setSending(true);
            // Optimistically reserve the slot so concurrent callbacks don't double-send.
            lastPingMsRef.current = nowMs;

            const { latitude, longitude, accuracy, speed, heading } = pos.coords;
            const res = await recordAgentLocation({
                latitude,
                longitude,
                accuracyM: Number.isFinite(accuracy) ? accuracy : undefined,
                speed: speed != null && Number.isFinite(speed) && speed >= 0 ? speed : undefined,
                heading: heading != null && Number.isFinite(heading) && heading >= 0 ? heading : undefined,
                visitId,
            });

            if (res.success) {
                setLastSentAt(new Date());
                setError(null);
            } else {
                // Roll back the throttle slot so the next callback retries.
                lastPingMsRef.current = 0;
                setError(res.error ?? 'Failed to send location');
            }
            sendingRef.current = false;
            setSending(false);
        },
        [visitId],
    );

    const startSharing = useCallback(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setStatus('error');
            setError('Geolocation is not supported on this device');
            return;
        }
        setError(null);
        setStatus('sharing');
        lastPingMsRef.current = 0; // allow an immediate first ping

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                void pushPing(pos);
            },
            (err) => {
                setStatus('error');
                setError(
                    err.code === err.PERMISSION_DENIED
                        ? 'Location permission denied. Enable GPS access to share your location.'
                        : 'Could not read your location. Check GPS and try again.',
                );
                stopWatch();
            },
            { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
        );
    }, [pushPing, stopWatch]);

    const stopSharing = useCallback(() => {
        stopWatch();
        setStatus('idle');
        setSending(false);
    }, [stopWatch]);

    // Clean up the watch on unmount.
    useEffect(() => () => stopWatch(), [stopWatch]);

    const sharing = status === 'sharing';

    return (
        <div className={`glass-card p-4 ${className ?? ''}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${sharing ? 'bg-emerald-500/15 text-emerald-600' : 'bg-surface text-muted'
                            }`}
                    >
                        {sharing ? <Radio className="w-4 h-4 animate-pulse" /> : <MapPin className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Live Location</p>
                        <p className="text-[11px] text-muted truncate">
                            {sharing
                                ? lastSentAt
                                    ? `Sharing · last updated ${lastSentAt.toLocaleTimeString()}`
                                    : 'Sharing · waiting for GPS…'
                                : 'Off · your location is private'}
                        </p>
                    </div>
                </div>

                <button
                    onClick={sharing ? stopSharing : startSharing}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex-shrink-0 ${sharing
                        ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
                        : 'bg-accent text-white hover:bg-accent-hover'
                        }`}
                >
                    {sending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : sharing ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                        <Radio className="w-3.5 h-3.5" />
                    )}
                    {sharing ? 'Stop sharing' : 'Go live'}
                </button>
            </div>

            {error && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-700 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                </div>
            )}
        </div>
    );
}
