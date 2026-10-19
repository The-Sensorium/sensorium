import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  assignPlatformRole,
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

  it('report_member rejects a duplicate open report, then allows one after actioning', async () => {
    const a = await member('r-dup-a')
    const b = await member('r-dup-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // First report succeeds.
    const { data: firstId, error: firstErr } = await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'harassment',
    })
    expect(firstErr).toBeNull()
    expect(firstId).toBeTruthy()

    // While it is still pending/reviewing, a second same-pair report is rejected.
    const { error: dupErr } = await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'harassment',
    })
    expect(dupErr?.message).toContain('duplicate_report')

    // After the original is actioned (no longer open), a new report is allowed.
    const { error: actionErr } = await admin
      .from('reports')
      .update({ status: 'dismissed' })
      .eq('id', firstId)
    expect(actionErr).toBeNull()

    const { data: secondId, error: retryErr } = await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'spam',
    })
    expect(retryErr).toBeNull()
    expect(secondId).not.toBe(firstId)
    expect(secondId).toBeTruthy()
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

  it('delete_my_account does not duplicate the departure when calls race', async () => {
    const a = await member('del-race-a')
    const b = await member('del-race-b')
    const candidate = await member('del-race-c')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      queueKey: '1996-04-02',
    })
    clusterIds.push(clusterId)
    await admin.from('queue_entries').insert({
      user_id: candidate.id,
      mode: 'exact_birthdate',
      queue_key: '1996-04-02',
    })

    // A double submit or retry lands while the first call is still running.
    const [first, second] = await Promise.all([
      a.client.rpc('delete_my_account'),
      a.client.rpc('delete_my_account'),
    ])
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()

    // One departure notice, one replacement cycle, one invitation.
    const { data: notices } = await admin
      .from('notifications')
      .select('id')
      .eq('cluster_id', clusterId)
      .eq('user_id', b.id)
      .like('body', 'A spot just opened%')
    expect(notices).toHaveLength(1)

    const { data: pending } = await admin
      .from('invitations')
      .select('id')
      .eq('cluster_id', clusterId)
      .eq('status', 'pending')
    expect(pending).toHaveLength(1)

    const { data: activeRounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
      .in('status', ['selecting_candidates', 'voting', 'inviting'])
    expect(activeRounds).toHaveLength(1)
  })

  it('delete_my_account leaves an in-flight replacement invite untouched', async () => {
    const a = await member('del-flight-a')
    const b = await member('del-flight-b')
    const leaver = await member('del-flight-l')
    const candidate = await member('del-flight-c')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id, leaver.id],
      queueKey: '1996-04-02',
    })
    clusterIds.push(clusterId)
    await admin.from('queue_entries').insert({
      user_id: candidate.id,
      mode: 'exact_birthdate',
      queue_key: '1996-04-02',
    })

    // The first departure opens a round and invites the waiting candidate.
    const { error: leaveErr } = await leaver.client.rpc('leave_cluster', {
      p_cluster_id: clusterId,
    })
    expect(leaveErr).toBeNull()

    const { data: before } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
      .eq('status', 'inviting')
      .single()
    expect(before?.id).toBeTruthy()

    // The deletion must not supersede that cycle or send a second invite.
    const { error } = await a.client.rpc('delete_my_account')
    expect(error).toBeNull()

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id, status')
      .eq('cluster_id', clusterId)
    expect(rounds).toHaveLength(1)
    expect(rounds![0].id).toBe(before!.id)
    expect(rounds![0].status).toBe('inviting')

    const { data: pending } = await admin
      .from('invitations')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('status', 'pending')
    expect(pending).toHaveLength(1)
    expect(pending![0].user_id).toBe(candidate.id)
  })

  it('delete_my_account does not refill a created cluster', async () => {
    const a = await member('del-created-a')
    const b = await member('del-created-b')
    const candidate = await member('del-created-c')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      queueKey: '1996-04-02',
    })
    clusterIds.push(clusterId)
    await admin.from('clusters').update({ origin: 'created' }).eq('id', clusterId)
    await admin.from('queue_entries').insert({
      user_id: candidate.id,
      mode: 'exact_birthdate',
      queue_key: '1996-04-02',
    })

    const { error } = await a.client.rpc('delete_my_account')
    expect(error).toBeNull()

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
    expect(rounds).toHaveLength(0)

    const { data: invitations } = await admin
      .from('invitations')
      .select('id')
      .eq('cluster_id', clusterId)
    expect(invitations).toHaveLength(0)

    const { data: notices } = await admin
      .from('notifications')
      .select('body')
      .eq('cluster_id', clusterId)
      .eq('user_id', b.id)
    expect(notices).toHaveLength(1)
    expect(notices![0].body).toBe('The cluster continues with its remaining members.')
  })

  it('banning a member of a created cluster keeps its pending invitations', async () => {
    const owner = await member('del-cr-owner')
    const target = await member('del-cr-target')
    const invitee = await member('del-cr-invitee')
    const staff = await member('del-cr-admin')
    await assignPlatformRole(admin, staff.id, 'admin')
    const clusterId = await createCluster(admin, {
      memberIds: [owner.id, target.id],
      queueKey: '1996-04-02',
    })
    clusterIds.push(clusterId)
    await admin.from('clusters').update({ origin: 'created' }).eq('id', clusterId)
    await admin.from('invitations').insert({ cluster_id: clusterId, user_id: invitee.id })

    const { error } = await staff.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'banned',
      p_reason: 'ban test',
    })
    expect(error).toBeNull()

    // Created clusters never refill or expire creator-owned invitations.
    const { data: invitations } = await admin
      .from('invitations')
      .select('user_id, status')
      .eq('cluster_id', clusterId)
    expect(invitations).toEqual([{ user_id: invitee.id, status: 'pending' }])

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
    expect(rounds).toHaveLength(0)
  })

  it('banning a member supersedes an in-flight round without orphaning its invite', async () => {
    const a = await member('del-ban-a')
    const b = await member('del-ban-b')
    const leaver = await member('del-ban-l')
    const first = await member('del-ban-c1')
    const second = await member('del-ban-c2')
    const staff = await member('del-ban-admin')
    await assignPlatformRole(admin, staff.id, 'admin')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id, leaver.id],
      queueKey: '1996-04-02',
    })
    clusterIds.push(clusterId)
    await admin.from('queue_entries').insert([
      { user_id: first.id, mode: 'exact_birthdate', queue_key: '1996-04-02' },
      { user_id: second.id, mode: 'exact_birthdate', queue_key: '1996-04-02' },
    ])

    // The departure opens a round and invites the longest-waiting candidate.
    await leaver.client.rpc('leave_cluster', { p_cluster_id: clusterId })
    const { data: oldInvite } = await admin
      .from('invitations')
      .select('id, user_id, status')
      .eq('cluster_id', clusterId)
      .single()
    expect(oldInvite?.status).toBe('pending')

    // Take the first candidate out of the pool so the superseding cycle has
    // someone else to invite.
    await admin
      .from('queue_entries')
      .delete()
      .eq('user_id', oldInvite!.user_id)
      .eq('mode', 'exact_birthdate')

    const { error } = await staff.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'banned',
      p_reason: 'ban test',
    })
    expect(error).toBeNull()

    const { data: invitations } = await admin
      .from('invitations')
      .select('id, user_id, status')
      .eq('cluster_id', clusterId)
      .order('created_at')

    // The superseded invitation is no longer acceptable, and only one invite
    // is pending for the cluster.
    expect(invitations!.find((i) => i.id === oldInvite!.id)?.status).toBe('expired')
    const pending = invitations!.filter((i) => i.status === 'pending')
    expect(pending).toHaveLength(1)
    expect(pending[0].user_id).toBe(second.id)
  })

  it('delete_my_account cannot be used to delete an account without a session', async () => {
    const a = await member('del-anon')
    const anon = anonClient()
    // The RPC is security definer and fail-closed; anon must be rejected.
    const { error } = await anon.rpc('delete_my_account')
    expect(error?.message).toBe('not_authenticated')

    // The account still exists.
    const { data: user } = await admin.auth.admin.getUserById(a.id)
    expect(user.user).not.toBeNull()
  })
})
