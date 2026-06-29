'use server'

/**
 * Server actions for Team Leaderboard & Gamification (Module 10).
 *
 * This file composes the pure, deterministic helpers in `@/lib/gamification`
 * (leaderboard ranking and badge-criteria evaluation) with persistence of the
 * `AgentScore`, `Badge`, and `AgentBadge` models. The pure helpers perform no
 * IO; all DB access, clock reads, and the once-per-period award guarantee live
 * here.
 *
 * Conventions (matching `app/actions/*`):
 * - `'use server'` module with `prisma` from `@/lib/db`.
 * - Untrusted input is parsed through Zod schemas.
 * - Every action returns `{ success: boolean, data?, error? }`.
 * - Pure business rules live in `@/lib/gamification`.
 *
 * Requirements:
 *   - 13.1 — Persist AgentScore records linking a Staff to a period (YYYY-MM)
 *            with a metrics object.
 *   - 13.2 — Persist Badge records (name, description, icon, criteria, tier)
 *            and AgentBadge records (Staff -> Badge, earned date, period).
 *   - 13.3 — Leaderboard: ranked table for a selected metric and period.
 *   - 13.4 — Award the corresponding AgentBadge exactly once per period when an
 *            agent meets a badge's criteria (unique constraint on
 *            `(staffId, badgeId, period)`, design Property 49).
 *   - 13.5 — Leaderboard visibility gated by an admin setting (assumption A10):
 *            visible to all staff by default; admins may restrict to managers.
 */

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession } from '@/lib/auth-helpers'
import type { UserRole } from '@prisma/client'
import {
    rankLeaderboard,
    isBadgeEarned,
    type AgentScoreEntry,
    type BadgeCriteria,
    type LeaderboardRow,
} from '@/lib/gamification'

const LEADERBOARD_PATH = '/leaderboard'

// ─── Input validation ────────────────────────────────

/** A period string in `YYYY-MM` form (e.g. `2024-07`). */
const periodSchema = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be in YYYY-MM format')

/** A metrics map: metric name -> finite numeric value. */
const metricsSchema = z.record(z.string().min(1), z.number().finite())

const upsertAgentScoreSchema = z.object({
    staffId: z.number().int().positive(),
    period: periodSchema,
    metrics: metricsSchema,
})

const createBadgeSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    icon: z.string().max(255).optional(),
    // Criteria is an open JSON map; the pure helper validates each entry.
    criteria: z.record(z.string().min(1), z.unknown()),
    tier: z.string().max(50).optional(),
})

const awardBadgesSchema = z.object({
    staffId: z.number().int().positive(),
    period: periodSchema,
})

const leaderboardSchema = z.object({
    metric: z.string().min(1),
    period: periodSchema,
})

// ─── Helpers ─────────────────────────────────────────

/** Narrow a thrown value to a Prisma unique-constraint violation (P2002). */
function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: unknown }).code === 'P2002'
    )
}

/**
 * Coerce a persisted `metrics` JSON value into a `Record<string, number>`.
 * Non-object values become `{}`, and non-finite entries are dropped, so the
 * pure ranking/criteria helpers always receive a well-formed numeric map.
 */
function toMetrics(value: unknown): Record<string, number> {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return {}
    }
    const out: Record<string, number> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            out[key] = raw
        }
    }
    return out
}

/**
 * Leaderboard visibility levels (assumption A10):
 *   - `ALL` (default): visible to ADMIN, MANAGER, and STAFF.
 *   - `MANAGERS`: restricted to ADMIN and MANAGER only.
 */
type LeaderboardVisibility = 'ALL' | 'MANAGERS'

/** Roles permitted to view the leaderboard for a given visibility setting. */
function rolesForVisibility(visibility: LeaderboardVisibility): UserRole[] {
    return visibility === 'MANAGERS'
        ? (['ADMIN', 'MANAGER'] as UserRole[])
        : (['ADMIN', 'MANAGER', 'STAFF'] as UserRole[])
}

/**
 * Read the configured leaderboard visibility. The default is `ALL` (visible to
 * all staff). An admin may restrict it via a `leaderboardVisibility` value on
 * `StoreSettings`; the column is read defensively so this works whether or not
 * the optional setting has been provisioned yet.
 */
async function getLeaderboardVisibility(): Promise<LeaderboardVisibility> {
    try {
        const rows = await prisma.$queryRaw<Array<{ leaderboardVisibility: string | null }>>`
            SELECT "leaderboardVisibility" as "leaderboardVisibility"
            FROM "StoreSettings"
            WHERE "id" = 1
            LIMIT 1
        `
        return rows[0]?.leaderboardVisibility === 'MANAGERS' ? 'MANAGERS' : 'ALL'
    } catch {
        // Column not provisioned -> default to visible-to-all.
        return 'ALL'
    }
}

// ─── AgentScore persistence (Req 13.1) ───────────────

/**
 * Create or update an agent's score for a period. AgentScore is unique per
 * `(staffId, period)`, so re-submitting a period replaces its metrics rather
 * than creating a duplicate (Req 13.1).
 */
export async function upsertAgentScore(data: unknown) {
    const parsed = upsertAgentScoreSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { staffId, period, metrics } = parsed.data

    try {
        const score = await prisma.agentScore.upsert({
            where: { staffId_period: { staffId, period } },
            update: { metrics },
            create: { staffId, period, metrics },
        })
        revalidatePath(LEADERBOARD_PATH)
        return { success: true, data: { ...score, metrics: toMetrics(score.metrics) } }
    } catch (err) {
        if (isUniqueViolation(err)) {
            return { success: false, error: 'A score for this agent and period already exists.' }
        }
        throw err
    }
}

/** Fetch a single agent's score for a period, or `null` when none exists. */
export async function getAgentScore(staffId: number, period: string) {
  if (process.env.DEMO_MODE === 'true') {
    return { success: true, data: { staffId, period, points: 1250, details: {} } }
  }
    const parsedPeriod = periodSchema.safeParse(period)
    if (!parsedPeriod.success) return { success: false, error: parsedPeriod.error.issues[0].message }

    const score = await prisma.agentScore.findUnique({
        where: { staffId_period: { staffId, period: parsedPeriod.data } },
    })
    return {
        success: true,
        data: score ? { ...score, metrics: toMetrics(score.metrics) } : null,
    }
}

// ─── Badge persistence (Req 13.2) ────────────────────

/** Persist a Badge definition with its name, description, icon, criteria, and tier. */
export async function createBadge(data: unknown) {
    const parsed = createBadgeSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { name, description, icon, criteria, tier } = parsed.data

    const badge = await prisma.badge.create({
        data: {
            name,
            description: description ?? null,
            icon: icon ?? null,
            criteria: criteria as object,
            tier: tier ?? null,
        },
    })
    revalidatePath(LEADERBOARD_PATH)
    return { success: true, data: badge }
}

/** List all Badge definitions. */
export async function listBadges() {
    if (process.env.DEMO_MODE === 'true') {
        return { success: true, data: [] }
    }
    const badges = await prisma.badge.findMany({ orderBy: { id: 'asc' } })
    return { success: true, data: badges }
}

// ─── Award badges (Req 13.4, Property 49) ────────────

/**
 * Award every badge whose criteria the agent satisfies for the period, exactly
 * once per `(staff, badge, period)`.
 *
 * Eligibility is decided by the pure `isBadgeEarned` helper against the agent's
 * AgentScore metrics for the period. The once-per-period guarantee is enforced
 * by the unique constraint on `AgentBadge(staffId, badgeId, period)`: a
 * duplicate `create` raises P2002, which is caught and treated as a no-op. This
 * makes the action idempotent — repeated invocations never create more than one
 * AgentBadge record.
 */
export async function awardBadges(staffId: number, period: string) {
    if (process.env.DEMO_MODE === 'true') return { success: true, data: { awarded: [] } }

    const parsedPeriod = periodSchema.safeParse(period)
    if (!parsedPeriod.success) return { success: false, error: parsedPeriod.error.issues[0].message }

    const [agentScore, allBadges] = await Promise.all([
        prisma.agentScore.findUnique({ where: { staffId_period: { staffId, period: parsedPeriod.data } } }),
        prisma.badge.findMany(),
    ])

    if (!agentScore) return { success: false, error: 'Agent score not found for period' }

    const earned = allBadges.filter((b) => isBadgeEarned(toMetrics(agentScore.metrics), (b.criteria ?? {}) as BadgeCriteria))
    const newlyAwarded: string[] = []

    for (const b of earned) {
        try {
            await prisma.agentBadge.create({
                data: {
                    staffId,
                    badgeId: b.id,
                    period: parsedPeriod.data,
                },
            })
            newlyAwarded.push(b.name)
        } catch (e: any) {
            // Ignore P2002 (Unique constraint failed): badge already awarded this period.
            if (!isUniqueViolation(e)) throw e
        }
    }

    if (newlyAwarded.length > 0) revalidatePath(LEADERBOARD_PATH)
    return { success: true, data: { awarded: newlyAwarded } }
}

/** List the badges an agent has earned, optionally filtered to a period. */
export async function getAgentBadges(staffId: number, period?: string) {
    if (process.env.DEMO_MODE === 'true') return { success: true, data: [] }

    let resolvedPeriod: string | undefined
    if (period !== undefined) {
        const parsedPeriod = periodSchema.safeParse(period)
        if (!parsedPeriod.success) return { success: false, error: parsedPeriod.error.issues[0].message }
        resolvedPeriod = parsedPeriod.data
    }

    const agentBadges = await prisma.agentBadge.findMany({
        where: { staffId, ...(resolvedPeriod ? { period: resolvedPeriod } : {}) },
        include: { badge: true },
        orderBy: { earnedDate: 'desc' },
    })
    return { success: true, data: agentBadges }
}

// ─── Leaderboard query (Req 13.3, 13.5, Property 48) ──

/**
 * Return the ranked leaderboard for a selected metric and period.
 *
 * Visibility is gated per assumption A10 (Req 13.5): the leaderboard is visible
 * to all staff by default, but an admin may restrict it to managers. When the
 * acting user's role is not permitted, the action returns a `forbidden` error
 * instead of data.
 *
 * Ranking is delegated to the pure `rankLeaderboard` helper, which orders
 * agents in non-increasing order of the selected metric with deterministic
 * tie-breaking (design Property 48). Staff display names are attached to each
 * ranked row for the UI.
 */
export async function getLeaderboard(data: unknown) {
  if (process.env.DEMO_MODE === 'true') {
    return { success: true, data: { rows: [{ staffId: 1, name: 'Rohan Desai', value: 1250, rank: 1, previousRank: 2, badges: [] }] } }
  }
    const parsed = leaderboardSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { metric, period } = parsed.data

    // Visibility gating (Req 13.5 / A10).
    const session = await getSession()
    const role = session?.user?.role
    if (!role) return { success: false, error: 'Unauthorized', forbidden: true }

    const visibility = await getLeaderboardVisibility()
    if (!rolesForVisibility(visibility).includes(role)) {
        return { success: false, error: 'Leaderboard access is restricted.', forbidden: true }
    }

    const scores = await prisma.agentScore.findMany({
        where: { period },
        include: { staff: { select: { id: true, name: true } } },
    })

    const entries: AgentScoreEntry[] = scores.map((s) => ({
        staffId: s.staffId,
        metrics: toMetrics(s.metrics),
    }))

    const nameByStaffId = new Map<number, string>(
        scores.map((s) => [s.staffId, s.staff?.name ?? `Staff #${s.staffId}`])
    )

    const ranked: (LeaderboardRow & { name: string })[] = rankLeaderboard(entries, metric).map(
        (row) => ({ ...row, name: nameByStaffId.get(row.staffId) ?? `Staff #${row.staffId}` })
    )

    return { success: true, data: { metric, period, rows: ranked } }
}
