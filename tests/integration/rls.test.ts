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

// RLS denial matrix: the existing tests assert RPC-level denials. These verify
// the table-level Row Level Security itself - that a non-member sees no rows
// from a cluster, that direct cross-user writes are blocked, and that an
// unauthenticated (anon) client gets nothing it should not.

describe('RLS denial matrix', () => {
  const admin = adminClient()
  const anon = anonClient()
  const userIds: string[] = []
  const clusterIds: string[] = []

  beforeEach(() => {
    userIds.length = 0
    clusterIds.length = 0
  })

  afterEach(async () => {
    await cleanup(admin, clusterIds, userIds)
  })

  async function member(prefix: string): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await onboardUser(admin, u.id, { dob: '1995-01-15' })
    return u
  }

  /** Seeded row counts per cluster (both fixtures active). */
  async function wireCluster(): Promise<{
    a: TestUser
    b: TestUser
    c: TestUser
    clusterId: string
    messageId: string
  }> {
    const a = await member('rls-a')
    const b = await member('rls-b')
    const c = await member('rls-c')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id], // a and b are active members; c is not
      status: 'active',
    })
    const { data, error } = await admin.from('messages').insert({
      cluster_id: clusterId,
      author_id: a.id,
      content: 'hi from a',
    }).select('id').single()
    if (error) throw error
    return { a, b, c, clusterId, messageId: data.id }
  }

  it('anon cannot read active-cluster messages', async () => {
    const { a, b, clusterId, messageId } = await wireCluster()
    const { data: anonRows } = await anon
      .from('messages')
      .select('id')
      .eq('cluster_id', clusterId)
    // anon either gets a GRANT denial (42501) or an empty RLS-filtered set —
    // either way the seeded message must not be visible.
    expect((anonRows ?? []).some((r) => r.id === messageId)).toBe(false)

    const { data: aRows } = await a.client
      .from('messages')
      .select('id')
      .eq('cluster_id', clusterId)
    expect((aRows ?? []).some((r) => r.id === messageId)).toBe(true)

    const { data: bRows } = await b.client
      .from('messages')
      .select('id')
      .eq('cluster_id', clusterId)
    expect((bRows ?? []).some((r) => r.id === messageId)).toBe(true)
  })

  it('a non-member sees nothing in an active cluster', async () => {
    const { b, c, clusterId } = await wireCluster()
    const { data: cRows } = await c.client
      .from('messages')
      .select('id')
      .eq('cluster_id', clusterId)
    expect((cRows ?? []).length).toBe(0)

    const { data: bRows } = await b.client
      .from('messages')
      .select('id')
      .eq('cluster_id', clusterId)
    expect((bRows ?? []).length).toBeGreaterThan(0)
  })

  it('a member cannot edit another member message', async () => {
    const { a, b, clusterId } = await wireCluster()
    const { data: messages } = await a.client
      .from('messages')
      .select('id')
      .eq('cluster_id', clusterId)
      .eq('author_id', a.id)
    const messageId = messages?.[0]?.id
    expect(messageId).toBeTruthy()

    const { data: updated, error } = await b.client
      .from('messages')
      .update({ content: 'tampered' })
      .eq('id', messageId)
      .select('id, content')
    // Author-only update RLS: either rejected outright or returns no rows.
    expect(error).toBeFalsy()
    expect((updated ?? []).length).toBe(0)

    const { data: still } = await a.client
      .from('messages')
      .select('content')
      .eq('id', messageId)
      .single()
    expect(still?.content).toBe('hi from a')
  })

  it('anon cannot read member-visible profiles beyond its own', async () => {
    const { a } = await wireCluster()
    const { data: anonProfiles } = await anon.from('profiles').select('id')
    const anonSeesOwnRow = (anonProfiles ?? []).some((p) => p.id === a.id)
    // The anon client has no session, so even if profiles are listed by a
    // permissive policy, our authenticated member's row must not be exposed.
    expect(anonSeesOwnRow).toBe(false)

    const { data: memberProfiles } = await a.client
      .from('profiles')
      .select('id')
      .in('id', [a.id])
    expect((memberProfiles ?? []).length).toBeGreaterThan(0)
  })

  it('anon cannot vote directly nor see cluster-only tables', async () => {
    const { clusterId } = await wireCluster()
    const { error } = await anon.rpc('vote_on', { p_vote_id: 'nope', p_choice: 'yes' })
    expect(error).not.toBeNull()

    const { data: anonMembers } = await anon
      .from('cluster_members')
      .select('cluster_id')
      .eq('cluster_id', clusterId)
    expect((anonMembers ?? []).length).toBe(0)
  })

  it('anon client can create its own auth session via helpers only, not direct', async () => {
    // Guard against regressions where anon gains write access to a protected table.
    const { clusterId } = await wireCluster()
    const { error } = await anon
      .from('messages')
      .insert({ cluster_id: clusterId, content: 'anon spam' })
    expect(error).not.toBeNull()
  })
})