import { test, expect, type Page } from '@playwright/test'

// E2E for the multi-user "Seen by" read-receipt flow (0048/0049) against the
// seeded local Supabase stack. Diya (primary demo login) and Rio (the second
// seeded login, in the same Aurora cluster) drive two separate browser contexts;
// the owner's open Message info dialog must reflect the other member's read in
// real time via the cluster_members UPDATE channel.
const EMAIL = process.env.E2E_EMAIL ?? 'diya@demo.example'
const RIO_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'rio@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page, email: string) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
}

async function openRoom(page: Page) {
  await page.getByRole('link', { name: /Aurora/i }).first().click()
  await expect(page.getByRole('heading', { name: 'Aurora' })).toBeVisible()
}

function seenRegion(page: Page) {
  return page.getByRole('dialog', { name: 'Message info' }).getByRole('region', { name: 'Seen by' })
}

function notSeenRegion(page: Page) {
  return page
    .getByRole('dialog', { name: 'Message info' })
    .getByRole('region', { name: 'Not seen yet' })
}

async function postMessage(page: Page, text: string) {
  await page.getByRole('combobox', { name: 'Message' }).fill(text)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText(text, { exact: true })).toBeVisible()
}

// Open the message actions menu for a specific message and tap Info.
async function openInfo(page: Page, text: string) {
  const item = page.getByText(text, { exact: true }).locator('xpath=ancestor::li')
  await item.getByRole('button', { name: 'Message actions' }).click()
  await item.getByRole('menuitem', { name: 'Info' }).click()
  await expect(page.getByRole('dialog', { name: 'Message info' })).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.describe('seen-by read receipts (two members)', () => {
  test('owner sees the other member in "Seen by" only after they read', async ({ browser }) => {
    const diyaCtx = await browser.newContext()
    const rioCtx = await browser.newContext()
    const diya = await diyaCtx.newPage()
    const rio = await rioCtx.newPage()

    // Diya opens the Aurora room and posts a message, but Rio is not in the room yet.
    await login(diya, EMAIL)
    await openRoom(diya)
    const text = `seen-by e2e ${Date.now()}`
    await postMessage(diya, text)

    // The message belongs to diya, so her Info dialog is the one that lists readers.
    await openInfo(diya, text)
    await expect(seenRegion(diya)).toContainText('No one has seen it yet.')
    await expect(notSeenRegion(diya).getByRole('link', { name: 'Rio Mendez' })).toBeVisible()

    // Rio logs in and opens the same room; reading the timeline advances his
    // watermark, which freezes a read_at row for diya's message.
    await login(rio, RIO_EMAIL)
    await openRoom(rio)
    await expect(rio.getByText(text, { exact: true })).toBeVisible()

    // Diya's open dialog updates live: Rio leaves "Not seen yet" and shows up in
    // "Seen by" with a read timestamp. The debounced read (400ms) -> RPC ->
    // realtime cluster_members broadcast -> refetch chain needs headroom on slow
    // stacks, so give these assertions a generous timeout.
    await expect(seenRegion(diya).getByRole('link', { name: /Rio Mendez/ }), {
      timeout: 15_000,
    }).toBeVisible()
    await expect(seenRegion(diya), { timeout: 15_000 }).toContainText(/[AP]M|\d{1,2}:\d{2}/)
    await expect(notSeenRegion(diya).getByRole('link', { name: 'Rio Mendez' })).toHaveCount(0)

    await diyaCtx.close()
    await rioCtx.close()
  })

  test('the other member is not shown as a reader of their own sent message', async ({ browser }) => {
    const diyaCtx = await browser.newContext()
    const rioCtx = await browser.newContext()
    const diya = await diyaCtx.newPage()
    const rio = await rioCtx.newPage()

    await login(diya, EMAIL)
    await openRoom(diya)
    await login(rio, RIO_EMAIL)
    await openRoom(rio)

    // Rio sends a message; diya reads it.
    const text = `rio to diya ${Date.now()}`
    await postMessage(rio, text)
    await expect(diya.getByText(text, { exact: true })).toBeVisible()

    // Rio opens Info on his own message: diya is the reader, rio is not listed.
    await openInfo(rio, text)
    await expect(seenRegion(rio).getByRole('link', { name: 'Diya Sharma' }), {
      timeout: 15_000,
    }).toBeVisible()
    await expect(seenRegion(rio).getByRole('link', { name: 'Rio Mendez' })).toHaveCount(0)

    await diyaCtx.close()
    await rioCtx.close()
  })
})