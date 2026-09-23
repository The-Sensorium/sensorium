import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { SEED_CREDS_FILE } from './global-setup'

// E2E for per-cluster unread badges on the home cards. Seeds chat messages
// via the service role (another member authors them so they count as unread
// for the demo user), then drives the UI: badge appears on /home, clears
// after opening the room (leading-edge mark_cluster_read on open).
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

let url: string
let serviceRole: string
let userId: string
let clusterId: string
let otherId: string
let seededMessageIds: string[] = []

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
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  const user = data.users.find((u) => u.email === EMAIL)
  if (!user) throw new Error(`Demo user ${EMAIL} not found; run seed:demo`)
  userId = user.id

  const { data: memberships, error: mErr } = await admin
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', userId)
    .is('left_at', null)
    .limit(1)
  if (mErr) throw mErr
  if (!memberships || memberships.length === 0) throw new Error('Demo user has no cluster; run seed:demo')
  clusterId = memberships[0].cluster_id

  const { data: others, error: oErr } = await admin
    .from('cluster_members')
    .select('user_id')
    .eq('cluster_id', clusterId)
    .is('left_at', null)
    .neq('user_id', userId)
    .limit(1)
  if (oErr) throw oErr
  if (!others || others.length === 0) throw new Error('Demo cluster has no other member')
  otherId = others[0].user_id

  // Deterministic baseline: drop e2e-seeded leftovers from prior runs so the
  // counts below are exact. Only touches rows this suite authors.
  const { error: clearErr } = await admin
    .from('messages')
    .delete()
    .eq('cluster_id', clusterId)
    .like('content', 'e2e unread%')
  if (clearErr) throw clearErr
})

test.afterEach(async () => {
  if (seededMessageIds.length === 0) return
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
  const { error } = await admin.from('messages').delete().in('id', seededMessageIds)
  if (error) console.warn('cleanup failed:', error.message)
  seededMessageIds = []
})

async function seedMessages(count: number) {
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
  const stamp = Date.now()
  const rows = Array.from({ length: count }, (_, i) => ({
    cluster_id: clusterId,
    author_id: otherId,
    content: `e2e unread ${stamp} ${i}`,
  }))
  const { data, error } = await admin.from('messages').insert(rows).select('id')
  if (error) throw error
  seededMessageIds = (data ?? []).map((r) => r.id)
}

test.describe.configure({ mode: 'serial' })

test.describe('cluster unread badges', () => {
  test('shows the per-cluster count on home and clears it after opening the room', async ({ page }) => {
    await seedMessages(2)

    await login(page)
    await page.goto('/home')
    const badge = page.locator(`[data-e2e="cluster-unread-badge-${clusterId}"]`)
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('2')

    await badge.click()
    await expect(page).toHaveURL(new RegExp(`/cluster/${clusterId}`))

    // Leading-edge mark on open clears the watermark; back on home the card
    // badge is gone once the counts refetch propagates.
    await page.goto('/home')
    await expect(page.locator(`[data-e2e="cluster-unread-badge-${clusterId}"]`)).toHaveCount(0)
  })
})
