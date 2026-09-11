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

describe('audit v2 (phase 7)', () => {
  it('moderators are denied; admins filter by action, actor, target, and report', async () => {
    const reporter = await member('au-rep')
    const target = await member('au-tgt')
    const mod = await moderator('au-mod')
    const adm = await administrator('av-adm')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)

    const { error: denied } = await mod.client.rpc('get_moderation_audit_v2', { p_filters: {} })
    expect(denied?.message).toContain('insufficient_permission')

    const { data: reportId } = await reporter.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'spam',
    })
    await adm.client.rpc('claim_moderation_report', { p_report_id: reportId })
    await adm.client.rpc('issue_warning', {
      p_user_id: target.id,
      p_reason: 'spam warning',
      p_report_id: reportId,
    })

    const { data: byAction } = await adm.client.rpc('get_moderation_audit_v2', {
      p_filters: { action: 'warning_issued', target_id: target.id },
    })
    const warnings = byAction as { action: string; target_user_id: string }[]
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings.every((w) => w.action === 'warning_issued' && w.target_user_id === target.id)).toBe(true)

    const { data: byActor } = await adm.client.rpc('get_moderation_audit_v2', {
      p_filters: { actor_id: adm.id },
    })
    expect((byActor as { actor_id: string }[]).every((r) => r.actor_id === adm.id)).toBe(true)

    const { data: byReport } = await adm.client.rpc('get_moderation_audit_v2', {
      p_filters: { report_id: reportId },
    })
    expect((byReport as unknown[]).length).toBeGreaterThanOrEqual(2)

    const { data: search } = await adm.client.rpc('get_moderation_audit_v2', {
      p_filters: { search: 'spam warning' },
    })
    expect((search as unknown[]).length).toBeGreaterThanOrEqual(1)

    const { data: empty } = await adm.client.rpc('get_moderation_audit_v2', {
      p_filters: { action: 'ban_applied', target_id: target.id },
    })
    expect((empty as unknown[]).length).toBe(0)
  })

  it('appeal actions carry the first-class appeal id', async () => {
    const target = await member('au-tgt2')
    const adm = await administrator('av-adm2')
    const clusterId = await createCluster(admin, { memberIds: [target.id] })
    clusterIds.push(clusterId)

    await adm.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'suspended',
      p_reason: 'spam wave',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    const { data: appealId } = await target.client.rpc('submit_appeal', { p_details: 'Sorry, reconsider.' })
    await adm.client.rpc('claim_appeal', { p_appeal_id: appealId })

    const { data } = await adm.client.rpc('get_moderation_audit_v2', {
      p_filters: { appeal_id: appealId },
    })
    const rows = data as { action: string; appeal_id: string }[]
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows.every((r) => r.appeal_id === (appealId as string))).toBe(true)
    expect(rows.some((r) => r.action === 'appeal_claimed')).toBe(true)
  })
})
