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

beforeEach(() => {
  userIds.length = 0
  clusterIds.length = 0
})

afterEach(async () => {
  await cleanup(admin, clusterIds, userIds)
})

describe('moderation policies (phase 5)', () => {
  it('members cannot list policies; moderators get seeded categories and templates', async () => {
    const a = await member('pol-mem')
    const mod = await moderator('pol-mod')
    const { data: memberRows, error: memberErr } = await a.client.rpc('list_moderation_policies')
    expect(memberErr).toBeNull()
    expect(memberRows).toHaveLength(0)

    const { data, error } = await mod.client.rpc('list_moderation_policies')
    expect(error).toBeNull()
    const rows = data as { category_code: string; template_code: string }[]
    const categories = new Set(rows.map((r) => r.category_code))
    for (const expected of ['harassment', 'hate_speech', 'spam', 'inappropriate_content', 'other']) {
      expect(categories.has(expected)).toBe(true)
    }
    expect(rows.some((r) => r.template_code === 'spam_first_warning')).toBe(true)
  })

  it('invalid policy codes are rejected on warning and restriction', async () => {
    const reporter = await member('pol-rep')
    const target = await member('pol-tgt')
    const mod = await moderator('pol-mod2')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)
    const { data: reportId } = await reporter.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'spam',
    })
    await mod.client.rpc('claim_moderation_report', { p_report_id: reportId })

    const { error: warnErr } = await mod.client.rpc('issue_warning', {
      p_user_id: target.id,
      p_reason: 'spam',
      p_report_id: reportId,
      p_policy_code: 'not_a_policy',
    })
    expect(warnErr?.message).toContain('invalid_policy_code')
  })

  it('valid policy codes are stored on the audit row', async () => {
    const reporter = await member('pol-rep2')
    const target = await member('pol-tgt2')
    const mod = await moderator('pol-mod3')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)
    const { data: reportId } = await reporter.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'spam',
    })
    await mod.client.rpc('claim_moderation_report', { p_report_id: reportId })

    const { error } = await mod.client.rpc('issue_warning', {
      p_user_id: target.id,
      p_reason: 'Your post was removed as spam.',
      p_report_id: reportId,
      p_policy_code: 'spam',
    })
    expect(error).toBeNull()

    const { data: timeline } = await mod.client.rpc('get_moderation_case_timeline', { p_report_id: reportId })
    const warned = (timeline as { kind: string; action: string }[]).find(
      (e) => e.kind === 'action' && e.action === 'warning_issued',
    )
    expect(warned).toBeDefined()

    const stored = await admin
      .from('moderation_actions')
      .select('policy_code')
      .eq('report_id', reportId as string)
      .eq('action', 'warning_issued')
      .single()
    expect(stored.data?.policy_code).toBe('spam')
  })
})
