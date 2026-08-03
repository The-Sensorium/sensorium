import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Governance: start_replace_vote / start_name_vote / vote_on / fn_quorum /
// close_expired_votes, the replacement lifecycle (start_replacement,
// source_candidates, create_invitation, accept_invitation, decline_invitation,
// expire_invitations, get_replacement_round, get_pending_invitations).

const DOB = '1994-11-02'
const CLUSTER_KEY = DOB

describe('governance and replacement', () => {
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
    await onboardUser(admin, u.id, { dob: DOB })
    return u
  }

  /** A cluster of `n` onboarded members with the same queue key. */
  async function clusterOf(n: number): Promise<{ clusterId: string; members: TestUser[] }> {
    const members: TestUser[] = []
    for (let i = 0; i < n; i++) {
      members.push(await member(`g-${Math.random().toString(36).slice(2, 7)}`))
    }
    const clusterId = await createCluster(admin, {
      memberIds: members.map((m) => m.id),
      name: 'Gov Cluster',
      mode: 'exact_birthdate',
      modeLabel: 'Gov',
      queueKey: CLUSTER_KEY,
      status: 'active',
    })
    clusterIds.push(clusterId)
    return { clusterId, members }
  }

  it('rejects a replacement vote against yourself', async () => {
    const { clusterId, members } = await clusterOf(2)
    const { error } = await members[0].client.rpc('start_replace_vote', {
      p_cluster_id: clusterId,
      p_target_member_id: members[0].id,
    })
    expect(error?.message).toContain('cannot_vote_self')
  })

  it('rejects a replacement vote from a non-member', async () => {
    const { clusterId, members } = await clusterOf(2)
    const outsider = await createUser(admin, 'g-nm')
    userIds.push(outsider.id)

    const { error } = await outsider.client.rpc('start_replace_vote', {
      p_cluster_id: clusterId,
      p_target_member_id: members[1].id,
    })
    expect(error?.message).toContain('not_a_member')
  })

  it('rejects a replacement vote targeting a non-member', async () => {
    const { clusterId, members } = await clusterOf(2)
    const outsider = await createUser(admin, 'g-tgt')
    userIds.push(outsider.id)

    const { error } = await members[0].client.rpc('start_replace_vote', {
      p_cluster_id: clusterId,
      p_target_member_id: outsider.id,
    })
    expect(error?.message).toContain('target_not_member')
  })

  it('vote_on rejects a non-yes/no choice for a member vote', async () => {
    const { clusterId, members } = await clusterOf(2)
    const { data: voteId } = await members[0].client.rpc('start_replace_vote', {
      p_cluster_id: clusterId,
      p_target_member_id: members[1].id,
    })

    const { error } = await members[1].client.rpc('vote_on', {
      p_vote_id: voteId,
      p_choice: 'maybe',
    })
    expect(error?.message).toContain('invalid_choice')
  })

  it('fn_quorum is majority (floor(n/2)+1)', async () => {
    const { data: q8 } = await admin.rpc('fn_quorum', { p_active: 8 })
    const { data: q5 } = await admin.rpc('fn_quorum', { p_active: 5 })
    expect(q8).toBe(5)
    expect(q5).toBe(3)
  })

  it('a replacement vote passes at quorum and starts a replacement round', async () => {
    const { clusterId, members } = await clusterOf(5)
    const [initiator, target] = [members[0], members[1]]

    const { data: voteId, error } = await initiator.client.rpc('start_replace_vote', {
      p_cluster_id: clusterId,
      p_target_member_id: target.id,
    })
    expect(error).toBeNull()

    // Close the vote window so the cron-equivalent can process it.
    const { error: closeErr } = await admin
      .from('votes')
      .update({ closes_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', voteId)
    expect(closeErr).toBeNull()

    // Quorum for 5 active members is 3 yes; cast 3 yes + 1 no.
    for (const m of [initiator, members[2], members[3]]) {
      const { error: ve } = await m.client.rpc('vote_on', {
        p_vote_id: voteId,
        p_choice: 'yes',
      })
      expect(ve).toBeNull()
    }
    const { error: noErr } = await members[4].client.rpc('vote_on', {
      p_vote_id: voteId,
      p_choice: 'no',
    })
    expect(noErr).toBeNull()

    const { error: procErr } = await initiator.client.rpc('close_expired_votes')
    expect(procErr).toBeNull()

    const { data: vote } = await admin
      .from('votes')
      .select('status, result')
      .eq('id', voteId)
      .single()
    expect(vote?.status).toBe('closed')
    expect(vote?.result?.outcome).toBe('passed')

    const { data: targetRow } = await admin
      .from('cluster_members')
      .select('left_at')
      .eq('cluster_id', clusterId)
      .eq('user_id', target.id)
      .single()
    expect(targetRow?.left_at).not.toBeNull()

    const { data: cooldowns } = await admin
      .from('mode_cooldowns')
      .select('mode, available_at')
      .eq('user_id', target.id)
    expect(cooldowns?.length).toBeGreaterThan(0)

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
    expect(rounds!.length).toBeGreaterThan(0)
  })

  it('a replacement vote fails without quorum', async () => {
    const { clusterId, members } = await clusterOf(5)
    const [initiator, target] = [members[0], members[1]]

    const { data: voteId } = await initiator.client.rpc('start_replace_vote', {
      p_cluster_id: clusterId,
      p_target_member_id: target.id,
    })
    await admin
      .from('votes')
      .update({ closes_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', voteId)

    // Only one yes cast: below quorum of 3.
    await initiator.client.rpc('vote_on', { p_vote_id: voteId, p_choice: 'yes' })

    await initiator.client.rpc('close_expired_votes')

    const { data: vote } = await admin
      .from('votes')
      .select('status, result')
      .eq('id', voteId)
      .single()
    expect(vote?.status).toBe('closed')
    expect(vote?.result?.outcome).toBe('failed')

    const { data: targetRow } = await admin
      .from('cluster_members')
      .select('left_at')
      .eq('cluster_id', clusterId)
      .eq('user_id', target.id)
      .single()
    expect(targetRow?.left_at).toBeNull()
  })

  it('a name-change vote renames the cluster when it passes', async () => {
    const { clusterId, members } = await clusterOf(5)
    const initiator = members[0]

    const { data: voteId } = await initiator.client.rpc('start_name_vote', {
      p_cluster_id: clusterId,
      p_name: 'Renamed Cluster',
    })
    await admin
      .from('votes')
      .update({ closes_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', voteId)

    for (const m of [initiator, members[1], members[2]]) {
      await m.client.rpc('vote_on', { p_vote_id: voteId, p_choice: 'yes' })
    }
    await initiator.client.rpc('close_expired_votes')

    const { data: cluster } = await admin
      .from('clusters')
      .select('name')
      .eq('id', clusterId)
      .single()
    expect(cluster?.name).toBe('Renamed Cluster')
  })

  it('leave_cluster marks the leaver, applies a cooldown, and starts a replacement', async () => {
    const { clusterId, members } = await clusterOf(4)
    const leaver = members[0]

    const { error } = await leaver.client.rpc('leave_cluster', {
      p_cluster_id: clusterId,
    })
    expect(error).toBeNull()

    const { data: leaverRow } = await admin
      .from('cluster_members')
      .select('left_at')
      .eq('cluster_id', clusterId)
      .eq('user_id', leaver.id)
      .single()
    expect(leaverRow?.left_at).not.toBeNull()

    const { data: cooldowns } = await admin
      .from('mode_cooldowns')
      .select('mode')
      .eq('user_id', leaver.id)
    expect(cooldowns?.length).toBeGreaterThan(0)

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
    expect(rounds!.length).toBeGreaterThan(0)
  })

  it('single eligible candidate is auto-invited without a vote', async () => {
    const { clusterId, members } = await clusterOf(4)
    const leaver = members[0]

    // One eligible candidate waiting in the cluster's exact queue.
    const candidate = await member('g-cand')
    const { error: qErr } = await admin.from('queue_entries').insert({
      user_id: candidate.id,
      mode: 'exact_birthdate',
      queue_key: CLUSTER_KEY,
    })
    expect(qErr).toBeNull()

    const { error } = await leaver.client.rpc('leave_cluster', {
      p_cluster_id: clusterId,
    })
    expect(error).toBeNull()

    const { data: round } = await admin
      .from('replacement_rounds')
      .select('status, invited_user_id')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(round?.status).toBe('inviting')
    expect(round?.invited_user_id).toBe(candidate.id)

    const { data: invitations } = await admin
      .from('invitations')
      .select('id, status')
      .eq('cluster_id', clusterId)
      .eq('user_id', candidate.id)
    expect(invitations).toHaveLength(1)
    expect(invitations![0].status).toBe('pending')
  })

  it('candidate can see the pending invitation and accept it', async () => {
    const { clusterId, members } = await clusterOf(4)
    const leaver = members[0]
    const candidate = await member('g-accept')
    await admin.from('queue_entries').insert({
      user_id: candidate.id,
      mode: 'exact_birthdate',
      queue_key: CLUSTER_KEY,
    })
    await leaver.client.rpc('leave_cluster', { p_cluster_id: clusterId })

    const { data: pending } = await candidate.client.rpc('get_pending_invitations')
    expect(pending).toHaveLength(1)
    expect(pending![0].cluster_id).toBe(clusterId)

    const { data: invitationId } = await admin
      .from('invitations')
      .select('id')
      .eq('cluster_id', clusterId)
      .eq('user_id', candidate.id)
      .single()

    const { error } = await candidate.client.rpc('accept_invitation', {
      p_invitation_id: invitationId.id,
    })
    expect(error).toBeNull()

    const { data: memberRow } = await admin
      .from('cluster_members')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('user_id', candidate.id)
      .is('left_at', null)
    expect(memberRow).toHaveLength(1)

    const { data: queue } = await admin
      .from('queue_entries')
      .select('id')
      .eq('user_id', candidate.id)
    expect(queue).toHaveLength(0)

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('status')
      .eq('cluster_id', clusterId)
      .eq('status', 'filled')
    expect(rounds!.length).toBeGreaterThan(0)
  })

  it('accept_invitation rejects invitations that are not yours', async () => {
    const { clusterId, members } = await clusterOf(4)
    const leaver = members[0]
    const candidate = await member('g-notyours')
    await admin.from('queue_entries').insert({
      user_id: candidate.id,
      mode: 'exact_birthdate',
      queue_key: CLUSTER_KEY,
    })
    await leaver.client.rpc('leave_cluster', { p_cluster_id: clusterId })

    const { data: invitation } = await admin
      .from('invitations')
      .select('id')
      .eq('cluster_id', clusterId)
      .single()

    const { error } = await members[1].client.rpc('accept_invitation', {
      p_invitation_id: invitation.id,
    })
    expect(error?.message).toContain('not_yours')
  })

  it('declining an invitation advances the round to the next candidate', async () => {
    const { clusterId, members } = await clusterOf(4)
    const leaver = members[0]
    const c1 = await member('g-dec1')
    // Only c1 is queued at first, so the round auto-invites them.
    await admin.from('queue_entries').insert({
      user_id: c1.id,
      mode: 'exact_birthdate',
      queue_key: CLUSTER_KEY,
    })
    await leaver.client.rpc('leave_cluster', { p_cluster_id: clusterId })

    const { data: inv1 } = await admin
      .from('invitations')
      .select('id, user_id')
      .eq('cluster_id', clusterId)
      .single()
    expect(inv1.user_id).toBe(c1.id)

    // A second candidate becomes available after the first is invited.
    const c2 = await member('g-dec2')
    const { error: qErr } = await admin.from('queue_entries').insert({
      user_id: c2.id,
      mode: 'exact_birthdate',
      queue_key: CLUSTER_KEY,
    })
    expect(qErr).toBeNull()

    const { error } = await c1.client.rpc('decline_invitation', {
      p_invitation_id: inv1.id,
    })
    expect(error).toBeNull()

    const { data: inv2 } = await admin
      .from('invitations')
      .select('user_id, status')
      .eq('cluster_id', clusterId)
      .eq('status', 'pending')
      .single()
    expect(inv2.user_id).toBe(c2.id)

    const { data: round } = await admin
      .from('replacement_rounds')
      .select('declined_user_ids')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(round?.declined_user_ids).toContain(c1.id)
  })

  it('expire_invitations voids pending invitations and advances the round', async () => {
    const { clusterId, members } = await clusterOf(4)
    const leaver = members[0]
    const c1 = await member('g-exp1')
    await admin.from('queue_entries').insert({
      user_id: c1.id,
      mode: 'exact_birthdate',
      queue_key: CLUSTER_KEY,
    })
    await leaver.client.rpc('leave_cluster', { p_cluster_id: clusterId })

    // A second candidate becomes available so the round can advance after expiry.
    const c2 = await member('g-exp2')
    await admin.from('queue_entries').insert({
      user_id: c2.id,
      mode: 'exact_birthdate',
      queue_key: CLUSTER_KEY,
    })

    // Force the first invitation to expire immediately.
    const { error: expErr } = await admin
      .from('invitations')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('cluster_id', clusterId)
      .eq('user_id', c1.id)
    expect(expErr).toBeNull()

    await leaver.client.rpc('expire_invitations')

    const { data: expired } = await admin
      .from('invitations')
      .select('status')
      .eq('cluster_id', clusterId)
      .eq('user_id', c1.id)
      .single()
    expect(expired?.status).toBe('expired')

    const { data: nextInv } = await admin
      .from('invitations')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('status', 'pending')
      .single()
    expect(nextInv?.user_id).toBe(c2.id)
  })

  it('get_replacement_round returns the active round to members only', async () => {
    const { clusterId, members } = await clusterOf(4)
    const leaver = members[0]
    await leaver.client.rpc('leave_cluster', { p_cluster_id: clusterId })

    const { data: round, error } = await members[1].client.rpc(
      'get_replacement_round',
      { p_cluster_id: clusterId },
    )
    expect(error).toBeNull()
    expect(round).toHaveLength(1)
    expect(['selecting_candidates', 'voting', 'inviting']).toContain(round[0].status)

    const outsider = await createUser(admin, 'g-noaccess')
    userIds.push(outsider.id)
    const { data: hidden } = await outsider.client.rpc('get_replacement_round', {
      p_cluster_id: clusterId,
    })
    expect(hidden).toHaveLength(0)
  })
})
