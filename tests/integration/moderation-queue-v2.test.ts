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

describe('moderation queue v2 (phase 1)', () => {
  it('members cannot read the summary or queue v2', async () => {
    const a = await member('q2-mem')
    const { error: summaryErr } = await a.client.rpc('get_staff_moderation_summary')
    expect(summaryErr?.message).toContain('insufficient_permission')
    const { error: queueErr } = await a.client.rpc('get_moderation_queue_v2', {
      p_filters: {},
      p_limit: 10,
      p_cursor: null,
    })
    expect(queueErr?.message).toContain('insufficient_permission')
  })

  it('moderators see triaged rows, severity backfill, and summary counts', async () => {
    const reporter = await member('q2-rep')
    const target = await member('q2-tgt')
    const mod = await moderator('q2-mod')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)

    const { data: reportId, error: reportErr } = await reporter.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'harassment',
    })
    expect(reportErr).toBeNull()

    const { data: queue, error: queueErr } = await mod.client.rpc('get_moderation_queue_v2', {
      p_filters: { sla: 'open', order: 'desc' },
      p_limit: 10,
      p_cursor: null,
    })
    expect(queueErr).toBeNull()
    const row = (queue as unknown[]).find((r) => (r as { id: string }).id === reportId) as {
      severity: string
      target_kind: string
      due_at: string
      priority_score: number
    }
    expect(row).toBeDefined()
    expect(row.severity).toBe('high')
    expect(row.target_kind).toBe('member')
    expect(row.due_at).not.toBeNull()
    expect(row.priority_score).toBeGreaterThan(0)

    const { data: summary, error: summaryErr } = await mod.client.rpc('get_staff_moderation_summary')
    expect(summaryErr).toBeNull()
    expect((summary as unknown[])[0]).toMatchObject({ pending_count: 1 })

    const { data: filtered } = await mod.client.rpc('get_moderation_queue_v2', {
      p_filters: { severity: 'high', reason: 'harassment', target_kind: 'member' },
      p_limit: 10,
      p_cursor: null,
    })
    expect((filtered as unknown[]).length).toBeGreaterThanOrEqual(1)

    const { data: empty } = await mod.client.rpc('get_moderation_queue_v2', {
      p_filters: { severity: 'urgent' },
      p_limit: 10,
      p_cursor: null,
    })
    expect((empty as unknown[]).length).toBe(0)
  })
})
