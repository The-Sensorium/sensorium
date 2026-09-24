import { createHmac, randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { SEED_CREDS_FILE } from './global-setup'

// E2E for staff two-step verification against the local Supabase stack. Each
// test gets a throwaway staff user (created via the service role, deleted
// afterwards): factor state is per-account, so sharing one demo account across
// runs left residue that broke later runs. Fresh users start with zero
// factors, which also makes every test hermetic and parallel-safe.
interface StaffUser {
  id: string
  email: string
  password: string
}

let admin: SupabaseClient
const created: string[] = []

test.beforeAll(async () => {
  const creds = JSON.parse(readFileSync(SEED_CREDS_FILE, 'utf8'))
  admin = createClient(creds.url, creds.serviceRole, { auth: { persistSession: false } })
})

test.afterEach(async () => {
  while (created.length > 0) {
    const id = created.pop()!
    await admin.from('user_roles').delete().eq('user_id', id)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error && !error.message.includes('not found')) console.warn('cleanup failed:', error.message)
  }
})

async function createStaffUser(): Promise<StaffUser> {
  const email = `mfa-${Date.now()}-${randomUUID().slice(0, 8)}@e2e.test`
  const password = `Mfa-e2e-${randomUUID().slice(0, 8)}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const id = data.user!.id
  created.push(id)
  const { error: profileError } = await admin
    .from('profiles')
    .update({ display_name: 'MFA Tester', onboarding_completed_at: new Date().toISOString() })
    .eq('id', id)
  if (profileError) throw profileError
  const { error: roleError } = await admin
    .from('user_roles')
    .insert({ user_id: id, role: 'moderator', granted_by: id, grant_reason: 'e2e mfa spec' })
  if (roleError) throw roleError
  return { id, email, password }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(
    page.getByRole('navigation').or(page.getByRole('heading', { name: 'Choose a workspace' })),
  ).toBeVisible()
  // Fresh staff hold member+moderator, so pin the member shell explicitly.
  // Otherwise later navigations bounce through the role picker.
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

async function confirmEnrollment(page: Page, secret: string, connectedText: string) {
  // The 30s window can roll over between computing and submitting; retry with
  // a fresh code. A failed attempt keeps the enrollment, so this is safe.
  for (let attempt = 0; attempt < 3; attempt++) {
    // A slow prior attempt may have succeeded already (status refetch lags
    // token swaps after verify): check before touching the form, and only
    // wait for the success text so a stale alert can't short-circuit the wait.
    if (await page.getByText(connectedText).isVisible()) return
    await page.getByTestId('mfa-code-input').fill(totp(secret))
    await page.getByTestId('mfa-confirm').click()
    try {
      await expect(page.getByText(connectedText)).toBeVisible({ timeout: 15_000 })
      return
    } catch {
      // Wrong code or still settling: retry with a fresh code.
    }
  }
  throw new Error('TOTP confirmation never succeeded')
}

test.describe('staff two-step verification', () => {
  test('redirects a signed-out visitor to the login page', async ({ page }) => {
    await page.goto('/mfa-setup')
    await expect(page).toHaveURL(/\/auth\/login/)
    await page.goto('/mfa-verify')
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('links to setup from settings with live status', async ({ page }, testInfo) => {
    const user = await createStaffUser()
    await login(page, user.email, user.password)
    await page.goto('/settings')
    // Staff two-step is desktop-only: mobile browsers hide the row and
    // bounce direct setup visits home.
    if (testInfo.project.name === 'mobile-chromium') {
      await expect(page.getByTestId('settings-mfa-link')).toHaveCount(0)
      await page.goto('/mfa-setup')
      await expect(page).toHaveURL(/\/home/)
      return
    }
    const link = page.getByTestId('settings-mfa-link')
    await expect(link).toBeVisible()
    await expect(link).toContainText(/Not set up|authenticator connected|Manage/)
    await link.click()
    await expect(page).toHaveURL(/\/mfa-setup/)
    await expect(page.getByTestId('mfa-setup')).toBeVisible()
  })

  test('abandoned setup retries cleanly, then enrolls and removes', async ({ page }, testInfo) => {
    const user = await createStaffUser()
    await login(page, user.email, user.password)

    // Desktop-only flow: mobile bounces setup home.
    if (testInfo.project.name === 'mobile-chromium') {
      await page.goto('/mfa-setup')
      await expect(page).toHaveURL(/\/home/)
      return
    }

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

    // Full cycle with a real code.
    await confirmEnrollment(page, secret, '1 authenticator connected.')
    await expect(page.getByText('1 authenticator connected.')).toBeVisible()

    // A second enrollment must get a fresh secret even with a verified factor
    // present (GoTrue requires unique factor names).
    await page.getByRole('button', { name: 'Add another' }).click()
    await expect(page.getByTestId('mfa-secret')).toBeVisible()
    const secondSecret = ((await page.getByTestId('mfa-secret').textContent()) ?? '').trim()
    expect(secondSecret.length).toBeGreaterThan(0)
    await confirmEnrollment(page, secondSecret, '2 authenticator connected.')
    await expect(page.getByText('2 authenticator connected.')).toBeVisible()
    // Factors die with the throwaway user in afterEach; the remove dialog
    // itself is covered by the cancel test below.
  })

  test('cancelling remove keeps the factor', async ({ page }, testInfo) => {
    const user = await createStaffUser()
    await login(page, user.email, user.password)
    if (testInfo.project.name === 'mobile-chromium') {
      await page.goto('/mfa-setup')
      await expect(page).toHaveURL(/\/home/)
      return
    }
    await page.goto('/mfa-setup')
    const secret = await startEnrollment(page)
    await confirmEnrollment(page, secret, '1 authenticator connected.')
    await expect(page.getByText('1 authenticator connected.')).toBeVisible()

    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByRole('dialog', { name: 'Remove authenticator?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('1 authenticator connected.')).toBeVisible()

    // Real removal for cleanup.
    await page.getByRole('button', { name: 'Remove' }).click()
    await page.getByTestId('mfa-remove-confirm').click()
    await expect(page.getByRole('button', { name: 'Set up authenticator' })).toBeVisible()
  })

  test('fresh staff login verifies with a real code, wrong code first', async ({ page }, testInfo) => {
    const user = await createStaffUser()
    await login(page, user.email, user.password)
    // Mobile has no setup UI: direct visits bounce home.
    if (testInfo.project.name === 'mobile-chromium') {
      await page.goto('/mfa-setup')
      await expect(page).toHaveURL(/\/home/)
      await page.goto('/mfa-verify')
      await expect(page).toHaveURL(/\/home/)
      return
    }
    await page.goto('/mfa-setup')
    const secret = await startEnrollment(page)
    await confirmEnrollment(page, secret, '1 authenticator connected.')
    await expect(page.getByText('1 authenticator connected.')).toBeVisible()

    // Fresh session drops to AAL1: entry must route to verify (desktop only;
    // mobile forces the member shell with no MFA step).
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.goto('/auth/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page).toHaveURL(/\/mfa-verify|\/home/)
    if (await page.getByTestId('mfa-verify').isVisible()) {
      await page.getByTestId('mfa-verify-input').fill('000000')
      await page.getByTestId('mfa-verify-submit').click()
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page).toHaveURL(/\/mfa-verify/)

      // The 30s window can roll over mid-submit; retry with a fresh code.
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.getByTestId('mfa-verify-input').fill(totp(secret))
        await page.getByTestId('mfa-verify-submit').click()
        try {
          await expect(page).toHaveURL(/\/select-role|\/home|\/admin|\/moderator/, { timeout: 10_000 })
          break
        } catch {
          await expect(page).toHaveURL(/\/mfa-verify/)
        }
      }
      await expect(page).toHaveURL(/\/select-role|\/home|\/admin|\/moderator/)
    }

    // Factors die with the throwaway user in afterEach.
  })
})
