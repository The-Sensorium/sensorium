import { createHmac } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'

// E2E for staff two-step verification against the seeded local Supabase stack,
// using the deterministic demo account (see settings.spec.ts for the pattern).
// Covers the regression where abandoning setup left an unverified factor that
// blocked retrying with "already exists".
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
  // Diya holds member+admin, so pin the member shell explicitly. Otherwise
  // later navigations bounce through the role picker.
  if (await page.getByRole('heading', { name: 'Choose a workspace' }).isVisible()) {
    await page.getByRole('button', { name: /For your clusters/i }).click()
  }
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page).toHaveURL(/\/home/)
}

/** RFC 6238 TOTP so the spec can confirm a real enrollment with no new deps. */
function totp(secret: string, atMs = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secret.replace(/\s+/g, '').toUpperCase()) {
    const v = alphabet.indexOf(c)
    if (v < 0) throw new Error(`bad base32 char: ${c}`)
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(Math.floor(atMs / 30000)))
  const digest = createHmac('sha1', Buffer.from(bytes)).update(msg).digest()
  const o = digest[digest.length - 1] & 0x0f
  const code = ((digest[o] & 0x7f) << 24) | (digest[o + 1] << 16) | (digest[o + 2] << 8) | digest[o + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

async function startEnrollment(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Set up authenticator' }).click()
  await expect(page.getByTestId('mfa-secret')).toBeVisible()
  return ((await page.getByTestId('mfa-secret').textContent()) ?? '').trim()
}

async function confirmEnrollment(page: Page, secret: string) {
  // The 30s window can roll over between computing and submitting; retry with
  // a fresh code. A failed attempt keeps the enrollment, so this is safe.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByTestId('mfa-code-input').fill(totp(secret))
    await page.getByTestId('mfa-confirm').click()
    if (
      await page
        .getByText('1 authenticator connected.')
        .waitFor({ timeout: 5000 })
        .then(() => true)
        .catch(() => false)
    ) {
      return
    }
  }
  throw new Error('TOTP confirmation never succeeded')
}

test.describe('staff two-step verification (seeded)', () => {
  // The tests share Diya's single factor list, so they must not run concurrently.
  test.describe.configure({ mode: 'serial' })

  test('redirects a signed-out visitor to the login page', async ({ page }) => {
    await page.goto('/mfa-setup')
    await expect(page).toHaveURL(/\/auth\/login/)
    await page.goto('/mfa-verify')
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('links to setup from settings with live status', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    const link = page.getByTestId('settings-mfa-link')
    await expect(link).toBeVisible()
    await expect(link).toContainText(/Not set up|authenticator connected|Manage/)
    await link.click()
    await expect(page).toHaveURL(/\/mfa-setup/)
    await expect(page.getByTestId('mfa-setup')).toBeVisible()
  })

  test('abandoned setup retries cleanly, then enrolls and removes', async ({ page }) => {
    await login(page)

    // Start setup, then abandon it for the dashboard: the classic path that
    // used to strand an unverified factor and fail the retry.
    await page.goto('/mfa-setup')
    await expect(page.getByTestId('mfa-setup')).toBeVisible()
    await startEnrollment(page)
    // Abandon setup for another page (mobile shells force staff routes home,
    // so only assert leaving the page, not the destination).
    await page.goto('/admin')
    await expect(page).not.toHaveURL(/\/mfa-setup/)

    // Retry must clear the abandoned factor and issue a fresh secret.
    await page.goto('/mfa-setup')
    const secret = await startEnrollment(page)
    await expect(page.getByRole('alert')).toHaveCount(0)

    // Full cycle with a real code, then remove it so the seeded account stays clean.
    await confirmEnrollment(page, secret)
    await expect(page.getByText('1 authenticator connected.')).toBeVisible()
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByRole('dialog', { name: 'Remove authenticator?' })).toBeVisible()
    await page.getByTestId('mfa-remove-confirm').click()
    await expect(page.getByRole('button', { name: 'Set up authenticator' })).toBeVisible()
  })
})
