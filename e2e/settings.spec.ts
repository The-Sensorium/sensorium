import { test, expect, type Page } from '@playwright/test'

// E2E for the account/settings tier against the seeded local Supabase stack,
// using the deterministic demo account (see golden-path.spec.ts for the env note).
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

test.describe('settings (seeded)', () => {
  test('redirects a signed-out visitor to the login page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  })

  test('renders the profile, status, preferences and account sections', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Notification preferences' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('updates the display name and it persists after a reload', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    const nameField = page.getByLabel('Display name')
    const original = (await nameField.inputValue()).trim() || 'You'
    const updated = `e2e ${Date.now()}`

    await nameField.fill(updated)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: updated })).toBeVisible()

    // Persisted server-side (self-write RLS round-trip)?
    await page.reload()
    await expect(page.getByLabel('Display name')).toHaveValue(updated)

    // Restore the original so the seeded account stays idempotent.
    await page.getByLabel('Display name').fill(original)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: original })).toBeVisible()
  })

  test('toggles a notification preference and restores it', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    const messages = page.getByRole('switch', { name: 'Messages' }).first()
    const before = (await messages.getAttribute('aria-checked')) === 'true'
    const after = !before

    await messages.click()
    await expect(messages).toHaveAttribute('aria-checked', String(before ? false : true))

    await messages.click()
    await expect(messages).toHaveAttribute('aria-checked', String(before))
  })

  test('signs out and requires login again', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})