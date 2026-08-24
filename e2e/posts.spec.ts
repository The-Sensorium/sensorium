import { test, expect, type Page } from '@playwright/test'

// E2E exercises the posts surface against a FULLY SEEDED local Supabase stack
// (diya@demo.example in the unlocked "Aurora" cluster). Ensure the stack is up
// (`supabase start` + `npm run seed:demo`) and the dev webServer is reachable
// before running. Override credentials via E2E_EMAIL / E2E_PASSWORD.
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

test.describe('posts (seeded)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('creates a text post, likes it and adds a comment', async ({ page }) => {
    const text = `E2E post ${Date.now()}`

    await page.goto('/posts')
    const composer = page.getByRole('textbox', { name: 'New post' })
    await expect(composer).toBeVisible()

    await composer.fill(text)
    await page.getByRole('button', { name: 'Post', exact: true }).click()

    const card = page.getByRole('article').filter({ hasText: text })
    await expect(card).toBeVisible()
    await expect(card.getByText(text)).toBeVisible()

    // Like it: the heart starts at 0 and becomes pressed at 1.
    await card.getByRole('button', { name: '0' }).click()
    await expect(card.getByRole('button', { name: '1' })).toHaveAttribute('aria-pressed', 'true')

    // Open the detail page and comment.
    await card.getByRole('link', { name: new RegExp(text) }).click()
    await expect(page).toHaveURL(/\/posts\//)
    await page.getByRole('textbox', { name: 'Add a comment' }).fill('Nice one!')
    await page.getByRole('button', { name: 'Comment' }).click()

    await expect(page.getByRole('heading', { name: /Comments \(1\)/ })).toBeVisible()
    await expect(page.getByText('Nice one!')).toBeVisible()
  })
})
