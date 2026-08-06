import { defineConfig, devices } from '@playwright/test'

// E2E requires a compiled app server (Vite dev is started below) plus a seeded
// local Supabase stack. Point BASE_URL at a deployed preview to skip webServer.
const PORT = Number(process.env.PORT ?? 5173)
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    testIdAttribute: 'data-e2e',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Both projects share one seeded local DB, and notifications.spec.ts
      // mutates (clears + reseeds) shared rows. They therefore must run
      // sequentially rather than in parallel — `npm run test:e2e` invokes
      // playwright once per project to avoid cross-project state races.
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Mobile emulation (Pixel 7) exercises the mobile-only chrome: the fixed
      // bottom nav, the room's internal scroll band, and the sticky composer.
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})