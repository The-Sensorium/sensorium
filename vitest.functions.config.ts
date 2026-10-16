import { defineConfig } from 'vitest/config'

// Edge Function unit tests (Deno workers' pure modules). Deliberately
// separate from vite.config.ts so the web unit-test glob and the v8
// coverage gate in `npm run test:coverage` are unaffected.
// Run: npx vitest run --config vitest.functions.config.ts
export default defineConfig({
  test: {
    include: ['supabase/functions/**/*.test.ts'],
    environment: 'node',
  },
})
