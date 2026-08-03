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

// Account lifecycle and moderation: report_member, delete_my_account, and the
// profiles RLS rules (self read/update, DOB immutability).

describe('account and moderation', () => {
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

  async function member(prefix: string): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await onboardUser(admin, u.id, { dob: '1996-04-02' })
    return u
  }

  it('report_member rejects self-reports', async () => {
    const a = await member('r-self')
    const clusterId = await createCluster(admin, { memberIds: [a.id], status: 'active' })
    clusterIds.push(clusterId)

    const { error } = await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: a.id,
      p_reason: 'harassment',
    })
    expect(error?.message).toContain('cannot_report_self')
  })

  it('report_member rejects reports from non-members', async () => {
    const a = await member('r-nm')
    const outsider = await createUser(admin, 'r-nm-out')
    userIds.push(outsider.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id], status: 'active' })
    clusterIds.push(clusterId)

    const { error } = await outsider.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: a.id,
      p_reason: 'spam',
    })
    expect(error?.message).toContain('not_a_member')
  })

  it('report_member records a report between members', async () => {
    const a = await member('r-ok-a')
    const b = await member('r-ok-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: reportId, error } = await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'hate_speech',
      p_details: 'example detail',
    })
    expect(error).toBeNull()
    expect(reportId).toBeTruthy()

    const { data: report } = await admin
      .from('reports')
      .select('reporter_id, target_user_id, reason, status')
      .eq('id', reportId)
      .single()
    expect(report?.reporter_id).toBe(a.id)
    expect(report?.target_user_id).toBe(b.id)
    expect(report?.reason).toBe('hate_speech')
    expect(report?.status).toBe('pending')
  })

  it('a member cannot read another member profile via RLS', async () => {
    const a = await member('p-rls-a')
    const b = await member('p-rls-b')
    const { data } = await b.client.from('profiles').select('id, email').eq('id', a.id)
    expect(data).toHaveLength(0)
  })

  it('a member can read and update their own profile', async () => {
    const a = await member('p-self')
    const { data: read } = await a.client.from('profiles').select('id, email').eq('id', a.id)
    expect(read).toHaveLength(1)
    expect(read![0].id).toBe(a.id)

    const { error: updateErr } = await a.client
      .from('profiles')
      .update({ bio: 'updated bio' })
      .eq('id', a.id)
    expect(updateErr).toBeNull()
  })

  it('DOB cannot be changed once set', async () => {
    const a = await member('p-dob')
    const { error } = await a.client
      .from('profiles')
      .update({ dob: '1980-01-01' })
      .eq('id', a.id)
    expect(error).not.toBeNull()
    expect(error?.message.toLowerCase()).toContain('date of birth')
  })

  it('delete_my_account departs clusters, notifies members, and removes the account', async () => {
    const a = await member('del-a')
    const b = await member('del-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { error } = await a.client.rpc('delete_my_account')
    expect(error).toBeNull()

    // a is no longer an active member.
    const { data: memberRow } = await admin
      .from('cluster_members')
      .select('left_at')
      .eq('cluster_id', clusterId)
      .eq('user_id', a.id)
      .single()
    expect(memberRow?.left_at).not.toBeNull()

    // b received a replacement/departure notification.
    const { data: notifs } = await admin
      .from('notifications')
      .select('type')
      .eq('cluster_id', clusterId)
      .eq('user_id', b.id)
    expect(notifs?.length).toBeGreaterThan(0)

    // A replacement round was started for the vacated seat.
    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
    expect(rounds!.length).toBeGreaterThan(0)

    // The auth user is gone.
    const { data: user } = await admin.auth.admin.getUserById(a.id)
    expect(user.user).toBeNull()
  })

  it('delete_my_account cannot be used to delete an account without a session', async () => {
    const a = await member('del-anon')
    const anon = anonClient()
    // The RPC is security definer; for anon it matches no row and no-ops.
    const { error } = await anon.rpc('delete_my_account')
    expect(error).toBeNull()

    // The account still exists.
    const { data: user } = await admin.auth.admin.getUserById(a.id)
    expect(user.user).not.toBeNull()
  })
})
