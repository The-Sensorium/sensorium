import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Matching: join_queue / leave_queue / maybe_form_cluster / get_my_queue_keys /
// get_my_matching_status and the guard rails around them (cooldowns, onboarding,
// local-mode location requirements).

const DOB = '1992-03-14'

describe('matching', () => {
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

  it('blocks join_queue before onboarding completes', async () => {
    const u = await createUser(admin, 'm-noob')
    userIds.push(u.id)
    const { error } = await u.client.rpc('join_queue', { p_mode: 'exact_birthdate' })
    expect(error?.message).toContain('complete onboarding first')
  })

  it('blocks join_queue while a cooldown is active', async () => {
    const u = await onboarded('m-cool')
    const { error: coolErr } = await admin.from('mode_cooldowns').insert({
      user_id: u.id,
      mode: 'exact_birthdate',
      available_at: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(coolErr).toBeNull()

    const { error } = await u.client.rpc('join_queue', { p_mode: 'exact_birthdate' })
    expect(error?.message).toContain('cooldown_active')
  })

  it('blocks join_queue when already in an active cluster of that mode', async () => {
    const u = await onboarded('m-incluster')
    const { data: cluster } = await admin
      .from('clusters')
      .insert({
        name: 'Existing Cluster',
        matching_mode: 'exact_birthdate',
        mode_label: 'Existing',
        queue_key: DOB,
        status: 'active',
        introductions_completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    clusterIds.push(cluster!.id)
    const { error: mErr } = await admin.from('cluster_members').insert({
      cluster_id: cluster!.id,
      user_id: u.id,
    })
    expect(mErr).toBeNull()

    const { error } = await u.client.rpc('join_queue', { p_mode: 'exact_birthdate' })
    expect(error?.message).toContain('already_in_cluster_of_mode')
  })

  it('joins a queue and reports the waiting count', async () => {
    const u = await onboarded('m-join')
    const { data, error } = await u.client.rpc('join_queue', {
      p_mode: 'exact_birthdate',
    })
    expect(error).toBeNull()
    const row = data?.[0]
    expect(row?.queue_key).toBe(DOB)
    expect(row?.waiting).toBe(1)

    const { data: keys } = await u.client.rpc('get_my_queue_keys')
    expect(keys).toHaveLength(1)
    expect(keys[0].mode).toBe('exact_birthdate')
    expect(keys[0].queue_key).toBe(DOB)
  })

  it('does not create a duplicate queue entry for the same mode', async () => {
    const u = await onboarded('m-dup')
    await u.client.rpc('join_queue', { p_mode: 'exact_birthdate' })
    const { error } = await u.client.rpc('join_queue', { p_mode: 'exact_birthdate' })
    expect(error).toBeNull()

    const { data: keys } = await u.client.rpc('get_my_queue_keys')
    expect(keys).toHaveLength(1)
  })

  it('leave_queue removes the entry', async () => {
    const u = await onboarded('m-leave')
    await u.client.rpc('join_queue', { p_mode: 'exact_birthdate' })
    const { error } = await u.client.rpc('leave_queue', { p_mode: 'exact_birthdate' })
    expect(error).toBeNull()

    const { data: keys } = await u.client.rpc('get_my_queue_keys')
    expect(keys).toHaveLength(0)
  })

  it('requires location data for local mode', async () => {
    const u = await onboarded('m-local')
    const { error } = await u.client.rpc('join_queue', {
      p_mode: 'local',
      p_radius_km: 50,
    })
    expect(error?.message).toContain('location_not_set')
  })

  it('joins the local queue when location data is present', async () => {
    const u = await onboarded('m-local2')
    const { error: profErr } = await admin
      .from('profiles')
      .update({
        country_code: 'PT',
        latitude: 38.7,
        longitude: -9.14,
        local_area: 'Lisbon',
        local_radius_km: 50,
      })
      .eq('id', u.id)
    expect(profErr).toBeNull()

    const { data, error } = await u.client.rpc('join_queue', {
      p_mode: 'local',
      p_radius_km: 50,
    })
    expect(error).toBeNull()
    const row = data?.[0]
    expect(row?.queue_key).toContain('PT')
    expect(row?.queue_key).toContain('Lisbon')
  })

  it('forms a cluster once eight users share a queue key', async () => {
    const users: TestUser[] = []
    for (let i = 0; i < 8; i++) {
      const u = await onboarded(`m-form-${i}`)
      users.push(u)
    }

    for (const u of users) {
      const { error } = await u.client.rpc('join_queue', { p_mode: 'exact_birthdate' })
      expect(error).toBeNull()
    }

    const { data: clusters } = await admin
      .from('clusters')
      .select('id, name, queue_key, status')
      .eq('queue_key', DOB)
    expect(clusters).toHaveLength(1)

    const clusterId = clusters![0].id
    clusterIds.push(clusterId)

    const { data: members } = await admin
      .from('cluster_members')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .is('left_at', null)
    expect(members).toHaveLength(8)

    const { data: remaining } = await admin
      .from('queue_entries')
      .select('id')
      .eq('queue_key', DOB)
    expect(remaining).toHaveLength(0)

    const { data: notifs } = await admin
      .from('notifications')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('type', 'cluster_formed')
    expect(notifs).toHaveLength(8)
  })

  it('get_my_matching_status reports joined state per mode', async () => {
    const u = await onboarded('m-status')
    await u.client.rpc('join_queue', { p_mode: 'birth_year' })

    const { data, error } = await u.client.rpc('get_my_matching_status')
    expect(error).toBeNull()
    const birthYear = data.find((r: { mode: string }) => r.mode === 'birth_year')
    expect(birthYear.joined).toBe(true)
    expect(birthYear.waiting).toBe(1)
    const exact = data.find((r: { mode: string }) => r.mode === 'exact_birthdate')
    expect(exact.joined).toBe(false)
  })

  it('get_my_clusters returns memberships with their active-member count', async () => {
    const a = await onboarded('mc-a')
    const b = await onboarded('mc-b')
    const c = await onboarded('mc-c')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id, c.id],
      name: 'Counted Cluster',
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data, error } = await a.client.rpc('get_my_clusters')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(clusterId)
    expect(data![0].name).toBe('Counted Cluster')
    expect(data![0].member_count).toBe(3)
    expect(data![0].status).toBe('active')

    // member_count only counts active members: once b leaves, it drops to 2.
    const { error: leaveErr } = await b.client.rpc('leave_cluster', {
      p_cluster_id: clusterId,
    })
    expect(leaveErr).toBeNull()

    const { data: afterLeave } = await a.client.rpc('get_my_clusters')
    expect(afterLeave).toHaveLength(1)
    expect(afterLeave![0].member_count).toBe(2)

    // A member who leaves their own cluster no longer sees it at all.
    const { data: bClusters } = await b.client.rpc('get_my_clusters')
    expect(bClusters).toHaveLength(0)
  })
})
