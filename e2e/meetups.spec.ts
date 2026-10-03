import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { SEED_CREDS_FILE } from './global-setup'

// Cluster Meetup flow against the seeded Aurora cluster using the
// deterministic demo account. The spec is idempotent: a leftover meetup from
// a previous run leaves an active proposal, so it votes on whatever is live
// instead of assuming a clean slate.
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

// Proposing is rate-limited (5/day), and the shared local stack accumulates
// creates across runs and manual sessions. Clear diya's meetup budget before
// the propose test so it stays deterministic. Scoped to the meetup action
// only; every other limit is untouched.
async function clearMeetupRateLimit() {
  const creds = JSON.parse(readFileSync(SEED_CREDS_FILE, 'utf8'))
  const admin = createClient(creds.url, creds.serviceRole, { auth: { persistSession: false } })
  const { data: profile } = await admin.from('profiles').select('id').eq('email', EMAIL).single()
  if (profile) {
    await admin.from('rate_limit_events').delete().eq('user_id', profile.id).eq('action', 'meetup')
  }
}

// The demo profile's timezone can be changed by manual testing sessions, and
// the zone selector defaults to it. Read it so assertions follow the data
// instead of hardcoding a zone.
async function demoProfileTimezone(): Promise<string | null> {
  const creds = JSON.parse(readFileSync(SEED_CREDS_FILE, 'utf8'))
  const admin = createClient(creds.url, creds.serviceRole, { auth: { persistSession: false } })
  const { data } = await admin.from('profiles').select('timezone').eq('email', EMAIL).single()
  return (data?.timezone as string | null) ?? null
}

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

function isDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1024
}

async function openMeetups(page: Page) {
  await login(page)
  await page.getByRole('link', { name: /Aurora/i }).first().click()
  await expect(page.getByRole('heading', { name: 'Aurora' })).toBeVisible()
  if (isDesktop(page)) {
    await page.getByRole('navigation', { name: 'Room sections' }).getByRole('link', { name: 'Meetups' }).click()
  } else {
    await page.getByRole('button', { name: 'Cluster sections' }).click()
    await page
      .getByRole('menu', { name: 'Cluster sections' })
      .getByRole('menuitem', { name: 'Meetups' })
      .click()
  }
  await expect(page.getByRole('region', { name: 'Cluster meetup' })).toBeVisible()
}

  // The view renders from cache first and refetches live state, so branch
  // only after it settles into one of the stable states (propose, ballot,
  // results, confirmed). Point-in-time isVisible checks race the refetch.
  async function settledState(page: Page) {
    const propose = page.getByRole('link', { name: 'Propose a time' })
    const ballot = page.getByTestId('meetup-vote-form')
    const change = page.getByRole('button', { name: 'Change my vote' })
    const confirmed = page.getByText('Your cluster meetup is set')
    await expect(propose.or(ballot).or(change).or(confirmed)).toBeVisible()
    if (await change.isVisible()) return 'results' as const
    if (await ballot.isVisible()) return 'ballot' as const
    if (await confirmed.isVisible()) return 'confirmed' as const
    return 'propose' as const
  }

  // Fill the nth custom row on the ballot builder (day 2 days out, 18:30).
  async function fillCustomRow(page: Page, index: number) {
    const row = page.getByTestId('meetup-custom-row').nth(index)
    const day = new Date()
    day.setDate(day.getDate() + 2)
    const pad = (n: number) => String(n).padStart(2, '0')
    await row.getByLabel(`Option ${index + 1} day`).fill(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`)
    await row.getByLabel(`Option ${index + 1} time`).fill('18:30')
  }

test.describe('cluster meetup (seeded Aurora)', () => {
  test('room shows the meetup entry point', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: /Aurora/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Aurora' })).toBeVisible()
    await expect(page.getByTestId('meetup-card')).toBeVisible()
  })

  test('ballot-builder propose flow reaches the quorum state', async ({ page }) => {
    await clearMeetupRateLimit()
    await openMeetups(page)
    if ((await settledState(page)) === 'propose') {
      await page.getByRole('link', { name: 'Propose a time' }).click()
      await expect(page.getByText('Propose times')).toBeVisible()
      // The zone selector defaults to the proposer's profile zone.
      const profileZone = await demoProfileTimezone()
      expect(profileZone).toBeTruthy()
      await expect(page.getByLabel('Meeting timezone')).toHaveValue(profileZone as string)
      // Prefilled first row is already valid; the CTA stays parked.
      await expect(page.getByText('1 time added.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add at least one more time' })).toBeDisabled()
      // Add and fill a second row through the option card pills.
      await page.getByRole('button', { name: 'Add another time' }).click()
      await fillCustomRow(page, 1)
      await expect(page.getByTestId('meetup-custom-row').nth(1).getByText('Local times for everyone')).toBeVisible()
      await page.getByRole('button', { name: 'Propose 2 times' }).click()
      await expect(page.getByText('When should we meet?')).toBeVisible()
    }
    if ((await settledState(page)) === 'ballot') {
      const ballot = page.getByTestId('meetup-vote-form')
      await expect(page.getByText('Times are shown in your local time.')).toBeVisible()
      await ballot.getByRole('radio').first().click()
      const submit = page.getByRole('button', { name: /Submit vote|Submit change|Update my vote/ })
      await expect(submit).toBeEnabled()
      await submit.click()
    }
    await expect(page.getByText(/Finding a time|Your cluster meetup is set/)).toBeVisible()
  })

  test('voted state shows results with edit and back-to-room paths', async ({ page }) => {
    await openMeetups(page)
    if ((await settledState(page)) === 'results') {
      await expect(page.getByText('Your pick')).toBeVisible()
      await page.getByRole('button', { name: 'Change my vote' }).click()
      await expect(page.getByRole('button', { name: 'Update my vote' })).toBeVisible()
      await page.getByRole('button', { name: 'Keep my current vote' }).click()
      await expect(page.getByText('Finding a time')).toBeVisible()
    } else {
      // Fresh ballot, confirmed meetup, or propose card: covered by the sibling test.
      await expect(
        page.getByText(/When should we meet\?|Your cluster meetup is set|Cluster Meetup/),
      ).toBeVisible()
    }
    const back = page.getByRole('link', { name: 'Back to room' })
    if (await back.isVisible()) {
      await back.click()
      await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible()
    }
  })
})
