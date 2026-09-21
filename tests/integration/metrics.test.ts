import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  createUser,
  onboardUser,
  createCluster,
  assignPlatformRole,
  cleanup,
  type TestUser,
} from './helpers'

// Success-metrics telemetry (0148/0149): aggregate snapshot tables, the
// queue-join trigger, the idempotent nightly rollup, and the admin-guarded
// read RPCs. Aggregates only — no user_id anywhere (asserted below).

const DOB = '1996-07-12'
const YESTERDAY = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)

describe('metrics telemetry', () => {
  const admin = adminClient()
  const userIds: string[] = []
  const clusterIds: string[] = []

  beforeEach(() => {
    userIds.length = 0
    clusterIds.length = 0
  })

  afterEach(async () => {
    await admin.from('cluster_daily_stats').delete().in('cluster_id', clusterIds.length ? clusterIds : ['00000000-0000-0000-0000-000000000000'])
    await admin.from('mode_daily_stats').delete().eq('day', YESTERDAY)
    await cleanup(admin, clusterIds, userIds)
  })

  async function onboarded(prefix: string, dob = DOB): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await onboardUser(admin, u.id, { dob })
    return u
  }

  async function adminUser(prefix: string): Promise<TestUser> {
    const u = await onboarded(prefix)
    await assignPlatformRole(admin, u.id, 'admin')
    return u
  }

  it('rolls up per-cluster and per-mode snapshots for a day', async () => {
    const a = await onboarded('met-a')
    const b = await onboarded('met-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      mode: 'generation',
      modeLabel: 'Born 1995-1999',
      queueKey: '1995-1999',
      name: 'Metric Cluster',
    })
    clusterIds.push(clusterId)

    const { error: msgErr } = await admin.from('messages').insert([
      { cluster_id: clusterId, author_id: a.id, content: 'one', created_at: `${YESTERDAY}T12:00:00Z` },
      { cluster_id: clusterId, author_id: b.id, content: 'two', created_at: `${YESTERDAY}T13:00:00Z` },
    ])
    expect(msgErr).toBeNull()

    const { error: rollErr } = await admin.rpc('rollup_daily_metrics', { p_day: YESTERDAY })
    expect(rollErr).toBeNull()

    const { data: rows } = await admin
      .from('cluster_daily_stats')
      .select('cluster_id, day, matching_mode, active_members, messages_day')
      .eq('cluster_id', clusterId)
      .eq('day', YESTERDAY)
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({
      matching_mode: 'generation',
      active_members: 2,
      messages_day: 2,
    })

    const { data: modes } = await admin
      .from('mode_daily_stats')
      .select('mode, day, clusters_formed')
      .eq('mode', 'generation')
      .eq('day', YESTERDAY)
    expect(modes).toHaveLength(1)
    expect(modes![0].clusters_formed).toBeGreaterThanOrEqual(0)

    const adminU = await adminUser('met-ov')
    const { data: overview, error: ovErr } = await adminU.client.rpc('get_metrics_overview')
    expect(ovErr).toBeNull()
    expect((overview?.[0]?.data_through_day ?? '') >= YESTERDAY).toBe(true)
    expect(overview?.[0]).toHaveProperty('last_rollup_at')
  })

  it('is idempotent: a second rollup for the same day changes nothing', async () => {
    const a = await onboarded('met-idem')
    const clusterId = await createCluster(admin, { memberIds: [a.id] })
    clusterIds.push(clusterId)

    await admin.rpc('rollup_daily_metrics', { p_day: YESTERDAY })
    await admin.rpc('rollup_daily_metrics', { p_day: YESTERDAY })

    const { data, count } = await admin
      .from('cluster_daily_stats')
      .select('cluster_id', { count: 'exact' })
      .eq('cluster_id', clusterId)
      .eq('day', YESTERDAY)
    expect(count).toBe(1)
    expect(data).toHaveLength(1)
  })

  it('counts queue joins via the trigger and ignores leaves', async () => {
    const u = await onboarded('met-join')
    const { error: joinErr } = await u.client.rpc('join_queue', { p_mode: 'birth_year' })
    expect(joinErr).toBeNull()

    const today = new Date().toISOString().slice(0, 10)
    const { data } = await admin
      .from('mode_daily_stats')
      .select('queue_joins')
      .eq('mode', 'birth_year')
      .eq('day', today)
    expect(data?.[0]?.queue_joins).toBeGreaterThanOrEqual(1)

    await u.client.rpc('leave_queue', { p_mode: 'birth_year' })
    const { data: after } = await admin
      .from('mode_daily_stats')
      .select('queue_joins')
      .eq('mode', 'birth_year')
      .eq('day', today)
    expect(after?.[0]?.queue_joins).toBe(data?.[0]?.queue_joins)

    await admin.from('mode_daily_stats').delete().eq('mode', 'birth_year').eq('day', today)
  })

  it('denies the metrics RPCs to anon and plain members, allows admins', async () => {
    const anon = anonClient()
    const { error: anonErr } = await anon.rpc('get_metrics_overview')
    expect(anonErr).not.toBeNull()

    const member = await onboarded('met-member')
    for (const fn of ['get_metrics_overview', 'get_retention', 'get_mode_breakdown'] as const) {
      const { error } = await member.client.rpc(fn)
      expect(error?.message).toContain('insufficient_permission')
    }
    const { error: actErr } = await member.client.rpc('get_cluster_activity', { p_limit: 10 })
    expect(actErr?.message).toContain('insufficient_permission')

    const adminU = await adminUser('met-admin')
    const { data, error } = await adminU.client.rpc('get_metrics_overview')
    expect(error).toBeNull()
    expect(data?.[0]?.total_clusters).toBeGreaterThanOrEqual(0)

    const { data: retention, error: retErr } = await adminU.client.rpc('get_retention')
    expect(retErr).toBeNull()
    // No clusters old enough in this test: cohorts legitimately come back
    // empty (content is covered by the retention test below).
    expect(Array.isArray(retention)).toBe(true)

    const { data: breakdown, error: bdErr } = await adminU.client.rpc('get_mode_breakdown')
    expect(bdErr).toBeNull()
    const modes = breakdown.map((r: { mode: string }) => r.mode)
    expect(modes).toContain('generation')
    expect(modes).not.toContain('birth_month')

    const { data: activity, error: actListErr } = await adminU.client.rpc('get_cluster_activity', { p_limit: 5 })
    expect(actListErr).toBeNull()
    expect(Array.isArray(activity)).toBe(true)
    for (const row of activity) {
      expect(row).toHaveProperty('mode')
      expect(row).toHaveProperty('name')
      expect(row).toHaveProperty('messages_30d')
    }

    const { data: capped, error: capErr } = await adminU.client.rpc('get_cluster_activity', { p_limit: 100000 })
    expect(capErr).toBeNull()
    expect(capped.length).toBeLessThanOrEqual(500)
  })

  it('computes retention from old live clusters, not snapshots', async () => {
    const members: TestUser[] = []
    for (let i = 0; i < 6; i++) members.push(await onboarded(`met-ret-${i}`))
    const oldDate = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString()

    const { data: cluster, error: cErr } = await admin
      .from('clusters')
      .insert({
        name: 'Old Cluster',
        matching_mode: 'birth_year',
        mode_label: '1992',
        queue_key: '1992',
        status: 'active',
        introductions_completed_at: oldDate,
        created_at: oldDate,
      })
      .select('id')
      .single()
    expect(cErr).toBeNull()
    clusterIds.push(cluster!.id)
    const { error: mErr } = await admin.from('cluster_members').insert(
      members.map((m) => ({ cluster_id: cluster!.id, user_id: m.id })),
    )
    expect(mErr).toBeNull()
    const { error: msgErr } = await admin.from('messages').insert({
      cluster_id: cluster!.id,
      author_id: members[0].id,
      content: 'still alive',
    })
    expect(msgErr).toBeNull()

    const adminU = await adminUser('met-ret-admin')
    const { data, error } = await adminU.client.rpc('get_retention')
    expect(error).toBeNull()
    const cohort90 = data.find((r: { cohort_days: number }) => r.cohort_days === 90)
    expect(cohort90.formed).toBeGreaterThanOrEqual(1)
    expect(cohort90.retained).toBeGreaterThanOrEqual(1)
    expect(cohort90.rate).toBeGreaterThan(0)
  })

  it('stores no user ids in the snapshot tables', async () => {
    const a = await onboarded('met-nouid')
    const clusterId = await createCluster(admin, { memberIds: [a.id] })
    clusterIds.push(clusterId)
    await admin.rpc('rollup_daily_metrics', { p_day: YESTERDAY })

    const { data: clusterRows } = await admin
      .from('cluster_daily_stats')
      .select('*')
      .eq('cluster_id', clusterId)
      .limit(1)
    expect(clusterRows!.length).toBeGreaterThanOrEqual(0)
    for (const row of clusterRows ?? []) {
      expect(row).not.toHaveProperty('user_id')
      expect(JSON.stringify(row)).not.toContain(a.id)
    }
    const { data: modeRows } = await admin.from('mode_daily_stats').select('*').limit(5)
    for (const row of modeRows ?? []) {
      expect(row).not.toHaveProperty('user_id')
    }
  })

  it('purges snapshots older than 24 months on rollup', async () => {
    const a = await onboarded('met-purge')
    const clusterId = await createCluster(admin, { memberIds: [a.id] })
    clusterIds.push(clusterId)
    const oldDay = new Date(Date.now() - 800 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const { error: insErr } = await admin.from('cluster_daily_stats').insert({
      cluster_id: clusterId,
      day: oldDay,
      matching_mode: 'exact_birthdate',
      active_members: 8,
    })
    expect(insErr).toBeNull()

    await admin.rpc('rollup_daily_metrics', { p_day: YESTERDAY })
    const { data } = await admin
      .from('cluster_daily_stats')
      .select('day')
      .eq('cluster_id', clusterId)
      .eq('day', oldDay)
    expect(data).toHaveLength(0)
  })
})
