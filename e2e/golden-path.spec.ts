import { test, expect, type Page } from '@playwright/test'

// NOTE: E2E exercises the golden path against a FULLY SEEDED local Supabase stack,
// using the deterministic demo account created by the docs' seed.sql. Ensure the
// stack is up (`supabase start` + seed) and the dev webServer is reachable before running.
// Override credentials via E2E_EMAIL / E2E_PASSWORD.
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

test.describe('golden path (seeded)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('logs in and lands on the dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/\/home/)
    await expect(page.getByRole('heading', { name: /Welcome,/i })).toBeVisible()
  })

  test('mode tiles on clusters link to their mode pages', async ({ page }) => {
    await page.goto('/clusters')

    const modes = page.getByRole('region', { name: 'Matching modes' })
    const exact = modes.getByRole('link', { name: /Exact Birthdate/i })
    await expect(exact).toBeVisible()
    await exact.click()
    await expect(page).toHaveURL(/\/discovery\/exact_birthdate/)
  })

  test('a formed cluster room renders its timeline', async ({ page }) => {
    await page.goto('/home')
    await page.getByRole('link', { name: /Aurora/i }).first().click()
    await expect(page.getByPlaceholder('Write to your cluster…')).toBeVisible()
    // Desktop shows the section tabs; mobile hides them behind the header menu.
    // The lg breakpoint (1024px) decides which one rendered; both e2e projects
    // use fixed devices, so this never races the UI mounting.
    const usesMenu = (page.viewportSize()?.width ?? 0) < 1024
    const menuButton = page.getByRole('button', { name: 'Cluster sections' })
    if (usesMenu) {
      await expect(menuButton).toBeVisible()
    } else {
      await expect(
        page.getByRole('navigation', { name: 'Room sections' }).getByRole('link', { name: 'Members' }),
      ).toBeVisible()
    }
  })
})