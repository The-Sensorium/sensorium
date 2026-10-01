import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  cleanup,
  createCluster,
  createUser,
  onboardUser,
  type TestUser,
} from './helpers'

// The mobile home gate must never treat an empty profile read as "new user".
// Proven against the live stack below: an unauthenticated read fails loudly
// (42501, no table grant for anon), but an authenticated read of another
// user's row is RLS-filtered to an empty SUCCESS (null data, null error).
// That empty success is indistinguishable from "no profile", so the client
// must retry it, never route on it.

describe('profile visibility by role', () => {
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

  async function onboardedMember(prefix: string): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await onboardUser(admin, u.id, { dob: '1995-01-15' })
    return u
  }

  it('an onboarded user reads their own completed profile', async () => {
    const u = await onboardedMember('profvis-a')
    const { data, error } = await u.client
      .from('profiles')
      .select('id,onboarding_completed_at')
      .eq('id', u.id)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(u.id)
    expect(data?.onboarding_completed_at).not.toBeNull()
  })

  it('an unauthenticated read of that profile fails loudly, not silently empty', async () => {
    const u = await onboardedMember('profvis-b')
    const { data, error } = await anon
      .from('profiles')
      .select('id,onboarding_completed_at')
      .eq('id', u.id)
      .maybeSingle()
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('an authenticated read of another user row is an empty success, not an error', async () => {
    const a = await onboardedMember('profvis-x')
    const b = await onboardedMember('profvis-y')
    const { data, error } = await a.client
      .from('profiles')
      .select('id,onboarding_completed_at')
      .eq('id', b.id)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('an unauthenticated caller sees an empty success from the user clusters RPC', async () => {
    const u = await onboardedMember('profvis-c')
    const clusterId = await createCluster(admin, { memberIds: [u.id], status: 'active' })
    clusterIds.push(clusterId)

    const authed = await u.client.rpc('get_my_clusters')
    expect((authed.data ?? []).some((row: { id: string }) => row.id === clusterId)).toBe(true)

    // get_my_clusters is security definer and PUBLIC keeps EXECUTE by default,
    // so anon runs it but auth.uid() is null: an EMPTY SUCCESS with no error,
    // indistinguishable from a member who has no clusters. The mobile gate
    // must never treat this as proof the user is fresh.
    const { data, error } = await anon.rpc('get_my_clusters')
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })
})
