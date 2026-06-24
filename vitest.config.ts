import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration for the Real Estate CRM.
 *
 * - `resolve.tsconfigPaths` honors the `@/*` path alias defined in
 *   tsconfig.json so tests import application/library modules the same way the
 *   app does (e.g. `@/lib/money`).
 * - Tests are colocated next to the code they validate using the `.test.ts`
 *   suffix (pure helpers in `lib/`) plus shared generators under `test/`.
 */
export default defineConfig({
    resolve: {
        tsconfigPaths: true,
    },
    test: {
        // Node environment: the property-tested logic is pure and server-side.
        environment: 'node',
        globals: true,
        include: [
            'lib/**/*.test.{ts,tsx}',
            'app/**/*.test.{ts,tsx}',
            'test/**/*.test.{ts,tsx}',
        ],
        exclude: ['node_modules', '.next', 'ai-agent'],
    },
})
