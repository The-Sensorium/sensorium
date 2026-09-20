import { test, expect, type Page } from '@playwright/test'

// Cluster lifecycle simplification: clusters open at formation (no waiting
// screens, no locked chat) and introductions are an optional in-cluster
// checklist. Requires the seeded stack (`supabase start` + `npm run
// seed:demo`); the Drift cluster seeds diya@demo.example with a pending
// intro so the nudge path is deterministic on a fresh seed.
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

async function openCluster(page: Page, name: RegExp) {
  await page.getByRole('link', { name }).first().click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test.describe('cluster lifecycle (seeded)', () => {
  test('/waiting redirects to the open room', async ({ page }) => {
    await login(page)
    await openCluster(page, /Aurora/i)
    const roomUrl = page.url()
    expect(roomUrl).toMatch(/\/cluster\/[^/]+$/)

    await page.goto(`${roomUrl}/waiting`)
    await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible()
    await expect(page).toHaveURL(/\/cluster\/[^/]+$/)
  })

  test('intro nudge answers all five questions and clears without locking', async ({ page }) => {
    await login(page)
    await openCluster(page, /Drift/i)

    // Diya's intro is pending in the seed: the checklist nudge shows, and the
    // room (composer included) is fully usable underneath it.
    await expect(page.getByText('Complete your introductions')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible()

    await page.getByRole('link', { name: 'Answer' }).click()
    await expect(page.getByRole('heading', { name: 'Tell your cluster who you are' })).toBeVisible()

    const areas = page.locator('form textarea')
    await expect(areas).toHaveCount(5)
    for (let i = 0; i < 5; i++) {
      await areas.nth(i).fill(`e2e intro answer ${i + 1} ${Date.now()}`)
    }
    await page.getByRole('button', { name: 'Save introductions' }).click()

    // Back in the room with the nudge cleared.
    await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible()
    await expect(page.getByText('Complete your introductions')).not.toBeVisible()
  })
})
