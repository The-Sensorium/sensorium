import { test, expect, type Browser, type Page } from '@playwright/test'

// Created clusters E2E against the seeded local stack. Diya, Rio, and Sofia
// all share the seeded Aurora cluster, so they are eligible co-members.
// Each test creates its own uniquely-named cluster to stay isolated. Invite
// cards are scoped via the cluster-name paragraph (names are unique per run).
const DIYA = process.env.E2E_EMAIL ?? 'diya@demo.example'
const RIO = process.env.E2E_MEMBER_EMAIL ?? 'rio@demo.example'
const SOFIA = 'member-0@demo.example'
const PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

async function login(page: Page, email: string) {
  await page.goto('/home')
  await page.getByLabel('Email').fill(email)
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

async function loginFresh(browser: Browser, email: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, email)
  return { context, page }
}

/** The home invite card for a cluster name (names are unique per run). */
function inviteCard(page: Page, name: string) {
  return page.locator('[data-e2e="invite-card"]', { hasText: name })
}

/** The home invite card details link for a cluster name. */
function inviteDetailsLink(page: Page, name: string) {
  return inviteCard(page, name).getByRole('link', { name: 'View invitation details' })
}

/** The home invite card Accept button for a cluster name. */
function inviteAcceptButton(page: Page, name: string) {
  return inviteCard(page, name).getByRole('button', { name: 'Accept' })
}

/** The clusters-list card link for a cluster name. */
function clusterCardLink(page: Page, name: string) {
  return page.getByRole('link').filter({ hasText: name }).first()
}

/** Diya creates a cluster inviting Rio + Sofia; returns the cluster name. */
async function createCluster(page: Page, name: string) {
  await page.goto('/clusters')
  await page.getByTestId('create-cluster-button').click()
  await expect(page).toHaveURL(/\/clusters\/new/)

  await page.getByTestId('create-cluster-name').fill(name)
  await page.getByTestId('create-cluster-continue').click()

  await expect(page.getByText('People you’ve shared clusters with')).toBeVisible()
  await page.getByRole('button', { name: 'Rio Mendez' }).click()
  await page.getByRole('button', { name: 'Sofia Almeida' }).click()
  await expect(page.getByText('2 selected')).toBeVisible()
  await page.getByTestId('create-cluster-review-continue').click()

  await expect(page.getByText('You', { exact: true })).toBeVisible()
  await expect(page.getByText('Creator')).toBeVisible()
  await page.getByTestId('create-cluster-send').click()

  await expect(page).toHaveURL(/\/cluster\/.+\/members/)
  return name
}

test.describe('created clusters (seeded)', () => {
  test('creator flow ends in a pending cluster with a locked room', async ({ page }) => {
    await login(page, DIYA)
    const name = `E2E Crew ${Date.now()}`
    await createCluster(page, name)

    await expect(page.getByText('2 more members needed to activate.')).toBeVisible()
    await expect(page.getByText('Rio Mendez')).toBeVisible()
    await expect(page.getByText('Sofia Almeida')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite more people' })).toBeVisible()

    // Room tab is gated until activation.
    await page.goto(page.url().replace('/members', ''))
    await expect(page.getByText('Waiting for members')).toBeVisible()

    // Clusters list shows the pending card for this cluster.
    await page.goto('/clusters')
    const card = clusterCardLink(page, name)
    await expect(card).toBeVisible()
    await expect(card.getByText('Pending · 2 more to activate')).toBeVisible()
  })

  test('invitees accept from the invite screen and the cluster activates', async ({
    page,
    browser,
  }) => {
    await login(page, DIYA)
    const name = `E2E Active ${Date.now()}`
    await createCluster(page, name)

    // Rio opens the invite detail and accepts.
    const rio = await loginFresh(browser, RIO)
    try {
      await rio.page.goto('/home')
      await inviteDetailsLink(rio.page, name).click()
      await expect(rio.page).toHaveURL(/\/invites\//)
      await expect(rio.page.getByText(`Diya Sharma invited you to join ${name}.`)).toBeVisible()
      await rio.page.getByTestId('invite-accept').click()
      await expect(rio.page).toHaveURL(/\/cluster\/.+\/members/)
    } finally {
      await rio.context.close()
    }

    // Still pending with 2 of 3 confirmed.
    await page.goto('/clusters')
    const pendingCard = clusterCardLink(page, name)
    await expect(pendingCard.getByText('Pending · 1 more to activate')).toBeVisible()

    // Sofia accepts from the home card; the cluster activates.
    const sofia = await loginFresh(browser, SOFIA)
    try {
      await sofia.page.goto('/home')
      await inviteAcceptButton(sofia.page, name).click()
      await expect(clusterCardLink(sofia.page, name)).toBeVisible({ timeout: 15_000 })
    } finally {
      await sofia.context.close()
    }

    // Diya sees the active card (no pending label) and an unlocked room.
    await page.goto('/clusters')
    const card = clusterCardLink(page, name)
    await expect(card.getByText('Pending', { exact: true })).toHaveCount(0)
    await card.click()
    await expect(page.getByRole('combobox', { name: 'Message' })).toBeVisible({
      timeout: 15_000,
    })
  })
})
