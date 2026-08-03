import { defineConfig } from 'vitest/config'

// Integration tests run in the Node environment against the live local Supabase
// stack (PostgREST + RLS + RPC functions). They need `supabase start` running.
// They are excluded from the jsdom unit-test config (vite.config.ts) which only
// matches `src/**/*.{test,spec}.{ts,tsx}`.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    // Files share the same live database, so run them sequentially to avoid
    // cross-file fixture interference and concurrent supabase CLI telemetry writes.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
