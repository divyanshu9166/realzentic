/**
 * Mutable test-session holder for integration tests.
 *
 * Integration test files mock `@/lib/auth-helpers` with a factory that reads
 * the current session from this module, so a test can switch the acting
 * principal (e.g. to an ADMIN staff member, or to no session) at runtime
 * without re-mocking. The real server actions then run their normal
 * role/auth gates against this controllable session.
 */
import type { UserRole } from '@prisma/client'

export interface TestSession {
    user: {
        id: string
        email: string
        name: string
        role: UserRole
        staffId: number | null
    }
}

let current: TestSession | null = {
    user: {
        id: '0',
        email: 'admin@test.local',
        name: 'Integration Admin',
        role: 'ADMIN',
        staffId: null,
    },
}

/** Replace the current test session (pass `null` to simulate an anonymous request). */
export function setTestSession(session: TestSession | null): void {
    current = session
}

/** Set the acting staff id on the current ADMIN session (for audit assertions). */
export function setTestStaffId(staffId: number | null): void {
    if (current) current.user.staffId = staffId
}

/** Read the current test session. */
export function getTestSession(): TestSession | null {
    return current
}

/** Reset to the default ADMIN session with no staff id. */
export function resetTestSession(): void {
    current = {
        user: {
            id: '0',
            email: 'admin@test.local',
            name: 'Integration Admin',
            role: 'ADMIN',
            staffId: null,
        },
    }
}
