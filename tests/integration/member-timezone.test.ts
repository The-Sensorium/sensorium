import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Member timezone (0161): profiles.timezone is exposed through
// get_member_profiles so the Members list can render each member's local
// time. Null stays null (clock hidden), and the members-only guard is
// unchanged.

describe('member timezone', () => {
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

  async function member(prefix: string, timezone: string | null): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await onboardUser(admin, u.id, { dob: '1995-01-15' })
    const { error } = await admin.from('profiles').update({ timezone }).eq('id', u.id)
    expect(error).toBeNull()
    return u
  }

  it('exposes each member timezone to fellow members and nothing to outsiders', async () => {
    const a = await member('tz-a', 'America/New_York')
    const b = await member('tz-b', null)
    const outsider = await createUser(admin, 'tz-out')
    userIds.push(outsider.id)
    await onboardUser(admin, outsider.id, { dob: '1995-01-15' })

    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data, error } = await a.client.rpc('get_member_profiles', {
      p_cluster_id: clusterId,
    })
    expect(error).toBeNull()
    const zones = new Map<string, string | null>()
    for (const row of data ?? []) zones.set(row.id, row.timezone)
    expect(zones.get(a.id)).toBe('America/New_York')
    expect(zones.get(b.id)).toBeNull()

    const { data: outside, error: outsideErr } = await outsider.client.rpc(
      'get_member_profiles',
      { p_cluster_id: clusterId },
    )
    expect(outsideErr).toBeNull()
    expect(outside ?? []).toHaveLength(0)
  })
})
