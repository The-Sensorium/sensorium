import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  assignPlatformRole,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

const admin = adminClient()
const userIds: string[] = []
const clusterIds: string[] = []

async function member(prefix: string): Promise<TestUser> {
  const u = await createUser(admin, prefix)
  userIds.push(u.id)
  await onboardUser(admin, u.id, { dob: '1996-04-02' })
  return u
}

async function moderator(prefix: string): Promise<TestUser> {
  const u = await createUser(admin, prefix)
  userIds.push(u.id)
  await assignPlatformRole(admin, u.id, 'moderator')
  return u
}

async function administrator(prefix: string): Promise<TestUser> {
  const u = await createUser(admin, prefix)
  userIds.push(u.id)
  await assignPlatformRole(admin, u.id, 'admin')
  return u
}

beforeEach(() => {
  userIds.length = 0
  clusterIds.length = 0
})

afterEach(async () => {
  await cleanup(admin, clusterIds, userIds)
})

describe('account operations (phase 4)', () => {
  it('members cannot touch account RPCs', async () => {
    const a = await member('ac-mem')
    const b = await member('ac-mem2')
    const { error: searchErr } = await a.client.rpc('search_accounts_v2', { p_query: 'ac' })
    expect(searchErr?.message).toContain('insufficient_permission')
    const { error: detailErr } = await a.client.rpc('get_staff_account_detail', { p_user_id: b.id })
    expect(detailErr?.message).toContain('insufficient_permission')
    const { error: histErr } = await a.client.rpc('get_account_moderation_history', { p_user_id: b.id })
    expect(histErr?.message).toContain('insufficient_permission')
  })

  it('moderators see redacted email; admins see full detail', async () => {
    const target = await member('ac-target')
    const mod = await moderator('ac-mod')
    const adm = await administrator('ac-adm')
    const clusterId = await createCluster(admin, { memberIds: [target.id] })
    clusterIds.push(clusterId)

    const { data: modRows, error: modErr } = await mod.client.rpc('search_accounts_v2', {
      p_query: 'Integration User',
    })
    expect(modErr).toBeNull()
    const modRow = (modRows as { user_id: string; email: string }[]).find((r) => r.user_id === target.id)
    expect(modRow).toBeDefined()
    expect(modRow?.email).toBeNull()

    const { data: admRows, error: admSearchErr } = await adm.client.rpc('search_accounts_v2', {
      p_query: target.email.slice(0, 12),
    })
    expect(admSearchErr).toBeNull()
    const admRow = (admRows as { user_id: string; email: string }[]).find((r) => r.user_id === target.id)
    expect(admRow?.email).toBe(target.email)

    const { data: modDetail, error: modDetailErr } = await mod.client.rpc('get_staff_account_detail', {
      p_user_id: target.id,
    })
    expect(modDetailErr).toBeNull()
    expect((modDetail as { email: string }[])[0].email).toBeNull()

    const { data: admDetail, error: admErr } = await adm.client.rpc('get_staff_account_detail', {
      p_user_id: target.id,
    })
    expect(admErr).toBeNull()
    expect((admDetail as { email: string }[])[0].email).toBe(target.email)
  })

  it('detail aggregates history and lift works through the explicit RPC', async () => {
    const reporter = await member('ac-rep')
    const target = await member('ac-tgt')
    const mod = await moderator('ac-mod2')
    const adm = await administrator('ac-adm2')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)

    const { data: reportId } = await reporter.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'spam',
    })

    const { data: hist } = await mod.client.rpc('get_account_moderation_history', { p_user_id: target.id })
    expect((hist as { kind: string; report_id: string }[]).some((e) => e.report_id === (reportId as string))).toBe(true)

    await mod.client.rpc('claim_moderation_report', { p_report_id: reportId })
    const { error: warnErr } = await mod.client.rpc('issue_warning', {
      p_user_id: target.id,
      p_reason: 'spam warning',
      p_report_id: reportId,
    })
    expect(warnErr).toBeNull()

    const { data: detail } = await mod.client.rpc('get_staff_account_detail', { p_user_id: target.id })
    const row = (detail as { total_reports_against: number; enforcement_count: number }[])[0]
    expect(row.total_reports_against).toBeGreaterThanOrEqual(1)
    expect(row.enforcement_count).toBeGreaterThanOrEqual(1)

    const { error: suspErr } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'suspended',
      p_reason: 'spam wave',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(suspErr).toBeNull()

    const { error: liftErr } = await mod.client.rpc('lift_account_restriction', {
      p_user_id: target.id,
      p_reason: 'served time',
    })
    expect(liftErr).toBeNull()

    const { data: after } = await mod.client.rpc('get_staff_account_detail', { p_user_id: target.id })
    expect((after as { account_status: string }[])[0].account_status).toBe('active')
  })

  it('unknown accounts raise user_not_found', async () => {
    const mod = await moderator('ac-mod3')
    const missing = '00000000-0000-0000-0000-000000000000'
    const { error: detailErr } = await mod.client.rpc('get_staff_account_detail', { p_user_id: missing })
    expect(detailErr?.message).toContain('user_not_found')
    const { error: histErr } = await mod.client.rpc('get_account_moderation_history', { p_user_id: missing })
    expect(histErr?.message).toContain('user_not_found')
  })
})
