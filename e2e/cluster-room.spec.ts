import { test, expect, type Page } from '@playwright/test'

// E2E against the fully seeded local Supabase stack using the deterministic
// demo account. See golden-path.spec.ts for the same environment note.
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

async function openRoom(page: Page) {
  await login(page)
  await page.getByRole('link', { name: /Aurora/i }).first().click()
  await expect(page.getByRole('heading', { name: 'Aurora' })).toBeVisible()
}

// The mobile header sections menu renders below the lg breakpoint (1024px); the
// desktop tab row renders at lg+. Both e2e projects use fixed devices, so the
// viewport width decides deterministically without waiting on the UI to mount.
function isDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1024
}

async function openSection(page: Page, name: string) {
  await openRoom(page)
  if (isDesktop(page)) {
    await page.getByRole('navigation', { name: 'Room sections' }).getByRole('link', { name }).click()
  } else {
    await page.getByRole('button', { name: 'Cluster sections' }).click()
    await page
      .getByRole('menu', { name: 'Cluster sections' })
      .getByRole('menuitem', { name })
      .click()
  }
}

test.describe('cluster room (seeded Aurora)', () => {
  test('renders the presence strip and the composer', async ({ page }) => {
    await openRoom(page)
    await expect(page.getByRole('heading', { name: /In the room now/i })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible()
  })

  test('posts a message that appears in the timeline', async ({ page }) => {
    await openRoom(page)
    const text = `e2e hello ${Date.now()}`
    await page.getByRole('combobox', { name: 'Message' }).fill(text)
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText(text, { exact: true })).toBeVisible()
  })

  test('mention autocomplete inserts a member chip into the timeline', async ({ page }) => {
    await openRoom(page)
    const composer = page.getByRole('combobox', { name: 'Message' })
    await composer.click()
    await composer.fill('@Rio')
    const listbox = page.getByRole('listbox', { name: 'Mention a member' })
    await expect(listbox).toBeVisible()
    await expect(listbox.getByRole('option', { name: /Rio Mendez/ })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(composer).toHaveValue('@Rio Mendez ')
    const text = `e2e mention ${Date.now()}`
    await composer.pressSequentially(text)
    await page.getByRole('button', { name: 'Send message' }).click()
    const sent = page.getByText(text, { exact: true })
    await expect(sent).toBeVisible()
    await expect(sent.locator('xpath=..').getByRole('link', { name: '@Rio Mendez' })).toBeVisible()
  })

  test('raise signal modal opens and can be cancelled without submitting', async ({ page }) => {
    await openRoom(page)
    await page.getByRole('button', { name: 'Room actions' }).click()
    await page.getByRole('menuitem', { name: 'Raise a signal' }).click()
    const dialog = page.getByRole('dialog', { name: 'Raise a signal' })
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('members section renders the member list', async ({ page }) => {
    await openSection(page, 'Members')
    if (isDesktop(page)) {
      await expect(
        page.getByRole('navigation', { name: 'Room sections' }).getByRole('link', { name: 'Members' }),
      ).toHaveAttribute('aria-current', 'page')
    } else {
      await page.getByRole('button', { name: 'Cluster sections' }).click()
      await expect(
        page
          .getByRole('menu', { name: 'Cluster sections' })
          .getByRole('menuitem', { name: 'Members' }),
      ).toHaveAttribute('aria-current', 'page')
    }
    const section = page.getByLabel('Members')
    await expect(section).toBeVisible()
    await expect(section.locator('a[href^="/profile/"]').first()).toBeVisible()
  })

  test('signals section renders its empty state', async ({ page }) => {
    await openSection(page, 'Signals')
    await expect(page.getByText(/No signals yet/)).toBeVisible()
  })

  test('votes section renders its empty state', async ({ page }) => {
    await openSection(page, 'Votes')
    await expect(page.getByLabel('Votes').getByText('No open votes right now.')).toBeVisible()
  })

  test('settings shows cluster details', async ({ page }) => {
    await openSection(page, 'Settings')
    await expect(page.getByRole('heading', { name: 'Cluster details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Aurora' })).toBeVisible()
    await expect(
      page.getByLabel('Cluster settings').getByText('Exact Birthdate'),
    ).toBeVisible()
  })
})
