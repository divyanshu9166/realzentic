/**
 * Mutable channel-partner test-session holder for integration tests.
 *
 * The channel-portal data actions resolve the acting partner via
 * `getCpSession` from `@/lib/cp-session`. Integration test files mock that
 * module with a factory that reads the current session from this holder, so a
 * test can switch the acting partner (or simulate an anonymous request) at
 * runtime without re-mocking. Mirrors `_session.ts`.
 */
import type { CpSessionPayload } from '@/lib/cp-session'

let current: CpSessionPayload | null = null

/** Replace the current CP test session (pass `null` to simulate no session). */
export function setCpTestSession(session: CpSessionPayload | null): void {
    current = session
}

/** Read the current CP test session. */
export function getCpTestSession(): CpSessionPayload | null {
    return current
}
