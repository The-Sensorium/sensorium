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

describe('ops health and limits (phase 8)', () => {
  it('blocks the 11th report in an hour with report_rate_limited', async () => {
    const reporter = await member('op-rep')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id] })
    clusterIds.push(clusterId)

    for (let i = 0; i < 10; i += 1) {
      const target = await member(`op-t${i}`)
      const { error } = await admin.from('reports').insert({
        cluster_id: clusterId,
        reporter_id: reporter.id,
        target_user_id: target.id,
        reason: 'spam',
        status: 'dismissed',
      })
      expect(error).toBeNull()
    }
    const extra = await member('op-tx')
    const { error } = await admin.from('reports').insert({
      cluster_id: clusterId,
      reporter_id: reporter.id,
      target_user_id: extra.id,
      reason: 'spam',
    })
    expect(error?.message).toContain('report_rate_limited')
  })

  it('blocks the 4th appeal in 24 hours with appeal_rate_limited', async () => {
    const target = await member('op-ap')
    for (let i = 0; i < 3; i += 1) {
      const { error } = await admin.from('appeals').insert({
        user_id: target.id,
        appealed_status: 'suspended',
        appealed_reason: 'spam',
        details: `appeal ${i}`,
        status: 'resolved',
      })
      expect(error).toBeNull()
    }
    const { error } = await admin.from('appeals').insert({
      user_id: target.id,
      appealed_status: 'suspended',
      appealed_reason: 'spam',
      details: 'one too many',
    })
    expect(error?.message).toContain('appeal_rate_limited')
  })

  it('SLA watch notifies once per breached report', async () => {
    const reporter = await member('op-rep2')
    const target = await member('op-tgt2')
    const mod = await moderator('op-mod2')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)

    const { data: reportId } = await reporter.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'harassment',
    })
    await admin.from('reports').update({ due_at: new Date(Date.now() - 3_600_000).toISOString() }).eq('id', reportId as string)

    const { data: first, error } = await mod.client.rpc('detect_moderation_sla_breaches')
    expect(error).toBeNull()
    expect(first).toBeGreaterThanOrEqual(1)

    const { data: second } = await mod.client.rpc('detect_moderation_sla_breaches')
    expect(second).toBe(0)

    const flagged = await admin.from('reports').select('sla_breach_notified_at').eq('id', reportId as string).single()
    expect(flagged.data?.sla_breach_notified_at).not.toBeNull()
  })

  it('ops health is admin-only and reports counts', async () => {
    const mod = await moderator('op-mod3')
    const adm = await administrator('op-adm3')
    const { error: denied } = await mod.client.rpc('get_admin_ops_health')
    expect(denied?.message).toContain('insufficient_permission')

    const { data, error } = await adm.client.rpc('get_admin_ops_health')
    expect(error).toBeNull()
    const row = (data as unknown[])[0] as Record<string, number>
    for (const key of [
      'email_queued',
      'email_stuck_sending',
      'email_failed_24h',
      'email_abandoned',
      'push_queued',
      'push_failed_24h',
      'reports_breached_open',
      'appeals_overdue_open',
    ]) {
      expect(typeof row[key]).toBe('number')
    }
  })
})
