import { test, expect, type Page } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

test.describe('safety (seeded)', () => {
  test('settings shows the Safety section with a My reports link', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    await expect(page.getByRole('region', { name: 'Safety' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'My reports' })).toBeVisible()
  })

  test('my reports page renders an empty state or rows', async ({ page }) => {
    await login(page)
    await page.goto('/settings/reports')
    await expect(page.getByRole('heading', { name: 'My reports' })).toBeVisible()
    const rows = page.locator('[data-e2e="my-report-row"]')
    const empty = page.getByText('No reports yet. Reports you submit appear here.')
    await expect(rows.first().or(empty)).toBeVisible()
  })
})
