import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { SEED_CREDS_FILE } from './global-setup'

// E2E for the notifications page against the seeded local Supabase stack.
// The demo seed (seed-demo.mjs) creates no notifications, so these tests seed
// their own rows via the service role (resolved once in global-setup.ts) and
// clean them up afterwards.
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

let url: string
let serviceRole: string
let userId: string
let seeded: string[] = []

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

test.beforeAll(async () => {
  const creds = JSON.parse(readFileSync(SEED_CREDS_FILE, 'utf8'))
  url = creds.url
  serviceRole = creds.serviceRole
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
  // The local stack accumulates auth users beyond the seed set, so request a
  // wide page - the default listing can leave the demo user off page one.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  const user = data.users.find((u) => u.email === EMAIL)
  if (!user) throw new Error(`Demo user ${EMAIL} not found; run seed:demo`)
  userId = user.id
  // Deterministic baseline: drop any notifications left over from prior runs so
  // the seeded counts below are exact.
  const { error: clearErr } = await admin.from('notifications').delete().eq('user_id', userId)
  if (clearErr) throw clearErr
})

test.afterEach(async () => {
  if (seeded.length === 0) return
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
  const { error } = await admin.from('notifications').delete().in('id', seeded)
  if (error) console.warn('cleanup failed:', error.message)
  seeded = []
})

async function seedNotification(
  overrides: { type?: string; title?: string; body?: string; readAt?: string | null } = {},
) {
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
  const row = {
    user_id: userId,
    type: overrides.type ?? 'message',
    title: overrides.title ?? `e2e ${Date.now()}`,
    body: overrides.body ?? 'Seeded by the E2E suite',
    read_at: overrides.readAt ?? null,
  }
  const { data, error } = await admin.from('notifications').insert(row).select('id').single()
  if (error) throw error
  seeded.push(data.id)
  return data.id
}

test.describe.configure({ mode: 'serial' })

test.describe('notifications (seeded)', () => {
  test('shows an empty state when there are no notifications', async ({ page }) => {
    await login(page)
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
    await expect(page.getByText(/all caught up/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })

  test('renders a seeded unread notification and keeps it as read on click', async ({ page }) => {
    const title = `e2e unread ${Date.now()}`
    await seedNotification({ title, body: 'Round trip through RLS + RPC' })

    await login(page)
    await page.goto('/notifications')
    const card = page.getByRole('button', { name: new RegExp(title) })
    await expect(card).toBeVisible()
    await expect(page.getByText('1 unread', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Unread', { exact: true })).toBeVisible()

    // Clicking the card marks it read without navigating (no cluster_id target),
    // and the card stays visible as read history.
    await card.click()
    await expect(page.getByLabel('Unread', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/all caught up/i)).toBeVisible()
    await expect(card).toBeVisible()
  })

  test('renders mixed read and unread history', async ({ page }) => {
    const stamp = Date.now()
    await seedNotification({ title: `e2e mixed read ${stamp}`, readAt: new Date().toISOString() })
    await seedNotification({ title: `e2e mixed unread ${stamp}` })

    await login(page)
    await page.goto('/notifications')
    await expect(page.getByText('1 unread', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Unread', { exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: new RegExp(`e2e mixed read ${stamp}`) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`e2e mixed unread ${stamp}`) })).toBeVisible()
  })

  test('marks all seeded notifications read via the bulk action', async ({ page }) => {
    await seedNotification({ title: `e2e bulk a ${Date.now()}` })
    await seedNotification({ title: `e2e bulk b ${Date.now()}` })

    await login(page)
    await page.goto('/notifications')
    await expect(page.getByText('2 unread', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Unread', { exact: true })).toHaveCount(2)

    await page.getByRole('button', { name: 'Mark all read' }).click()
    await expect(page.getByLabel('Unread', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/all caught up/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /e2e bulk/ })).toHaveCount(0)
  })
})