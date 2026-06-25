/**
 * Mutable buyer test-session holder for integration tests.
 *
 * The buyer-portal data actions resolve the acting buyer via `getBuyerSession`
 * from `@/lib/buyer-session`. Integration test files mock that module with a
 * factory that reads the current session from this holder, so a test can switch
 * the acting buyer (or simulate an anonymous request) at runtime without
 * re-mocking. Mirrors `_session.ts`.
 */
import type { BuyerAuthContext } from '@/lib/buyer-session'

let current: BuyerAuthContext | null = null

/** Replace the current buyer test session (pass `null` to simulate no session). */
export function setBuyerTestSession(session: BuyerAuthContext | null): void {
    current = session
}

/** Read the current buyer test session. */
export function getBuyerTestSession(): BuyerAuthContext | null {
    return current
}
