import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Discovery public cluster directory: get_public_cluster_counts and
// get_clusters_by_mode expose only non-sensitive cluster metadata (name, mode,
// status, member count) to any authenticated user via security-definer RPCs,
// while the clusters table itself stays RLS-closed to non-members.

const DOB = '1992-03-15'

interface CountRow {
  mode: string
  cluster_count: number
}

interface ClusterRow {
  id: string
  name: string
  mode_label: string
  status: string
  member_count: number
  created_at: string
}

describe('discovery public cluster directory', () => {
  const admin = adminClient()
  const userIds: string[] = []
  const clusterIds: string[] = []

  beforeEach(() => {
    userIds.length = 0
    clusterIds.length = 0
  })

  afterEach(async () => {
    await cleanup(admin, clusterIds, userIds)
  })

  async function onboarded(prefix: string): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await onboardUser(admin, u.id, { dob: DOB })
    return u
  }

  it('counts non-archived clusters per mode via the public RPC', async () => {
    const u = await onboarded('disc-counts')
    const { data: before } = await u.client.rpc('get_public_cluster_counts')
    const beforeBy = new Map(
      ((before ?? []) as CountRow[]).map((r) => [r.mode, r.cluster_count] as const),
    )

    const a = await onboarded('disc-counts-a')
    const b = await onboarded('disc-counts-b')
    const c = await onboarded('disc-counts-c')

    clusterIds.push(
      await createCluster(admin, {
        memberIds: [a.id, b.id],
        mode: 'exact_birthdate',
        modeLabel: 'Exact Birthdate',
      }),
      await createCluster(admin, {
        memberIds: [c.id],
        mode: 'exact_birthdate',
        modeLabel: 'Exact Birthdate',
      }),
      await createCluster(admin, {
        memberIds: [a.id],
        mode: 'birth_year',
        modeLabel: 'Birth Year',
      }),
    )

    // u is not a member of any of these clusters.
    const { data, error } = await u.client.rpc('get_public_cluster_counts')
    expect(error).toBeNull()
    const afterBy = new Map(
      ((data ?? []) as CountRow[]).map((r) => [r.mode, r.cluster_count] as const),
    )
    const delta = (mode: string) => (afterBy.get(mode) ?? 0) - (beforeBy.get(mode) ?? 0)
    expect(delta('exact_birthdate')).toBe(2)
    expect(delta('birth_year')).toBe(1)
  })

  it('lists only public metadata per mode and excludes archived clusters', async () => {
    const u = await onboarded('disc-list')
    const a = await onboarded('disc-list-a')
    const activeId = await createCluster(admin, {
      memberIds: [a.id],
      mode: 'birth_month',
      modeLabel: 'Birth Month',
      name: 'Night Owls',
    })
    clusterIds.push(activeId)

    const { data: archived, error: arErr } = await admin
      .from('clusters')
      .insert({
        name: 'Archived Cluster',
        matching_mode: 'birth_month',
        mode_label: 'Birth Month',
        queue_key: 'archived-k',
        status: 'archived',
      })
      .select('id')
      .single()
    expect(arErr).toBeNull()
    clusterIds.push(archived!.id)

    const { data, error } = await u.client.rpc('get_clusters_by_mode', {
      p_mode: 'birth_month',
    })
    expect(error).toBeNull()
    const rows = (data ?? []) as ClusterRow[]
    const ids = rows.map((c) => c.id)
    expect(ids).toContain(activeId)
    expect(ids).not.toContain(archived!.id)
    const row = rows.find((c) => c.id === activeId)
    expect(row?.name).toBe('Night Owls')
    expect(row?.mode_label).toBe('Birth Month')
    expect(row?.status).toBe('active')
    expect(row?.created_at).toEqual(expect.any(String))
    expect(row).not.toHaveProperty('queue_key')
    expect(row).not.toHaveProperty('introductions_deadline')
  })

  it('keeps the clusters table RLS-closed for non-members', async () => {
    const u = await onboarded('disc-rls')
    const owner = await onboarded('disc-rls-owner')
    clusterIds.push(
      await createCluster(admin, {
        memberIds: [owner.id],
        mode: 'exact_birthdate',
        modeLabel: 'Exact Birthdate',
      }),
    )

    const { data } = await u.client.from('clusters').select('id')
    expect(data).toHaveLength(0)
  })

  it('counts only active members in member_count', async () => {
    const a = await onboarded('disc-members-a')
    const b = await onboarded('disc-members-b')
    const c = await onboarded('disc-members-c')
    const id = await createCluster(admin, {
      memberIds: [a.id, b.id, c.id],
      mode: 'local',
      modeLabel: 'Local',
    })
    clusterIds.push(id)

    // c leaves the cluster.
    await admin
      .from('cluster_members')
      .update({ left_at: new Date().toISOString() })
      .eq('cluster_id', id)
      .eq('user_id', c.id)

    const { data, error } = await a.client.rpc('get_clusters_by_mode', { p_mode: 'local' })
    expect(error).toBeNull()
    const row = ((data ?? []) as ClusterRow[]).find((r) => r.id === id)
    expect(row?.member_count).toBe(2)
  })

  it('denies the directory RPCs to anonymous clients', async () => {
    // Create a cluster with a known name so an anon call would have something to
    // return if the revoke didn't take effect.
    const a = await onboarded('disc-anon-a')
    clusterIds.push(
      await createCluster(admin, {
        memberIds: [a.id],
        mode: 'birth_year',
        modeLabel: 'Birth Year',
        name: 'Anon Denied Cluster',
      }),
    )

    const anon = anonClient()
    const { data: counts, error: countsErr } = await anon.rpc('get_public_cluster_counts')
    expect(countsErr).not.toBeNull()
    expect(counts).toBeNull()

    const { data: list, error: listErr } = await anon.rpc('get_clusters_by_mode', {
      p_mode: 'birth_year',
    })
    expect(listErr).not.toBeNull()
    expect(list).toBeNull()
  })
})