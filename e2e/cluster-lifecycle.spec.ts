import { test, expect, type Page } from '@playwright/test'

// Cluster lifecycle simplification: clusters open at formation (no waiting
// screens, no locked chat) and introductions are an optional in-cluster
// checklist. Requires the seeded stack (`supabase start` + `npm run
// seed:demo`). The intro test is order-independent: diya's Drift intro is
// pending on a fresh seed, but all `test:e2e` projects share one seeded DB,
// so a prior project run may already have completed it.
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(
    page.getByRole('navigation').or(page.getByRole('heading', { name: 'Choose a workspace' })),
  ).toBeVisible()
  const memberWorkspace = page.getByRole('button', { name: /For your clusters/i })
  if (await memberWorkspace.isVisible()) {
    await memberWorkspace.click()
  }
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
    const roomUrl = page.url()
    expect(roomUrl).toMatch(/\/cluster\/[^/]+$/)

    // The room is usable whether or not the intro is pending.
    await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible()

    // Diya's intro is pending on a fresh seed, but an earlier project run
    // shares the seeded DB and may already have completed it. The form now
    // doubles as an edit form, so it renders in both cases with a different
    // heading and button label.
    await page.goto(`${roomUrl}/introductions`)
    const formHeading = page.getByRole('heading', { name: /Tell your cluster who you are|Edit your introductions/ })
    await expect(formHeading).toBeVisible({ timeout: 10_000 })

    const areas = page.locator('form textarea')
    await expect(areas).toHaveCount(5)
    for (let i = 0; i < 5; i++) {
      await areas.nth(i).fill(`e2e intro answer ${i + 1} ${Date.now()}`)
    }
    await page.getByRole('button', { name: /Save introductions|Save changes/ }).click()

    // Back in the room with the nudge cleared and the room fully usable.
    await page.goto(roomUrl)
    await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible()
    await expect(page.getByText('Complete your introductions')).not.toBeVisible()

    // Revisit the form: answers are prefilled and editable.
    await page.goto(`${roomUrl}/introductions`)
    await expect(
      page.getByRole('heading', { name: 'Edit your introductions' }),
    ).toBeVisible({ timeout: 10_000 })
    const editAreas = page.locator('form textarea')
    await expect(editAreas).toHaveCount(5)
    await expect(editAreas.first()).not.toBeEmpty()
    await editAreas.first().fill(`e2e intro edit ${Date.now()}`)
    await page.getByRole('button', { name: /Save introductions|Save changes/ }).click()
    await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible()
  })
})
