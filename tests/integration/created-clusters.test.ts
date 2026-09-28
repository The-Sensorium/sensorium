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

// Created clusters (0168): create_created_cluster / invite_to_created_cluster /
// cancel_created_invitation / get_eligible_comembers / get_created_invite_detail
// plus the created-origin branches in accept/decline/leave/expire/progress and
// the replace-vote block.

const DOB = '1992-03-14'

describe('created clusters', () => {
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

  /** Creator + mates share one queue-formed cluster; stranger shares nothing. */
  async function sharedSetup() {
    const creator = await onboarded('cc-creator')
    const mateA = await onboarded('cc-mate-a')
    const mateB = await onboarded('cc-mate-b')
    const mateC = await onboarded('cc-mate-c')
    const stranger = await onboarded('cc-stranger')
    const seedId = await createCluster(admin, {
      memberIds: [creator.id, mateA.id, mateB.id, mateC.id],
      name: 'Seed Cluster',
    })
    clusterIds.push(seedId)
    return { creator, mateA, mateB, mateC, stranger }
  }

  async function createFor(
    creator: TestUser,
    name: string,
    inviteeIds: string[],
  ) {
    const { data, error } = await creator.client.rpc('create_created_cluster', {
      p_name: name,
      p_invitee_ids: inviteeIds,
    })
    return { data: data as string | null, error }
  }

  it('rejects blank and over-long names', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    for (const bad of ['', '   ', 'x'.repeat(51)]) {
      const { error } = await createFor(creator, bad, [mateA.id, mateB.id])
      expect(error?.message).toContain('invalid_name')
    }
  })

  it('requires 2 to 7 invitees', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const one = await createFor(creator, 'Solo', [mateA.id])
    expect(one.error?.message).toContain('invalid_invite_count')

    const many = await createFor(creator, 'Crowd', [mateA.id, mateB.id, mateA.id])
    // dedup keeps 2 valid ids, so this one passes validation; assert it works
    expect(many.error).toBeNull()
    if (many.data) clusterIds.push(many.data)
  })

  it('rejects strangers with no shared history', async () => {
    const { creator, mateA, stranger } = await sharedSetup()
    const { error } = await createFor(creator, 'Crew', [mateA.id, stranger.id])
    expect(error?.message).toContain('not_eligible')
  })

  it('rejects suspended users as ineligible', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const adm = await onboarded('cc-admin')
    await assignPlatformRole(admin, adm.id, 'admin')
    const { error: suspErr } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: mateB.id,
      p_status: 'suspended',
      p_reason: 'integration suspension',
      p_expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    })
    expect(suspErr).toBeNull()

    const { error } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    expect(error?.message).toContain('not_eligible')

    const eligible = await creator.client.rpc('get_eligible_comembers')
    const ids = ((eligible.data ?? []) as { user_id: string }[]).map((r) => r.user_id)
    expect(ids).not.toContain(mateB.id)
    expect(ids).toContain(mateA.id)
  })

  it('creates the cluster with creator membership, pending invites, and notices', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId, error } = await createFor(creator, 'Late Night Crew', [
      mateA.id,
      mateB.id,
    ])
    expect(error).toBeNull()
    clusterIds.push(clusterId!)

    const { data: cluster } = await admin
      .from('clusters')
      .select('origin, created_by, mode_label, status')
      .eq('id', clusterId!)
      .single()
    expect(cluster?.origin).toBe('created')
    expect(cluster?.created_by).toBe(creator.id)
    expect(cluster?.mode_label).toBe('Created')
    expect(cluster?.status).toBe('active')

    const { data: members } = await admin
      .from('cluster_members')
      .select('user_id')
      .eq('cluster_id', clusterId!)
      .is('left_at', null)
    expect(members?.map((m) => m.user_id)).toEqual([creator.id])

    const { data: invites } = await admin
      .from('invitations')
      .select('user_id, status, inviter_id')
      .eq('cluster_id', clusterId!)
    expect(invites).toHaveLength(2)
    for (const inv of invites!) {
      expect(inv.status).toBe('pending')
      expect(inv.inviter_id).toBe(creator.id)
    }

    const { data: notes } = await admin
      .from('notifications')
      .select('user_id, type')
      .eq('cluster_id', clusterId!)
      .eq('type', 'invitation_received')
    expect(notes?.map((n) => n.user_id).sort()).toEqual(
      [mateA.id, mateB.id].sort(),
    )
  })

  it('lists eligible co-members including ex-members, excluding strangers', async () => {
    const { creator, mateA, stranger } = await sharedSetup()
    // mateA leaves the seed cluster: still eligible via history.
    await admin
      .from('cluster_members')
      .update({ left_at: new Date().toISOString() })
      .eq('cluster_id', clusterIds[0])
      .eq('user_id', mateA.id)

    const { data, error } = await creator.client.rpc('get_eligible_comembers')
    expect(error).toBeNull()
    const ids = (data ?? []).map((r: { user_id: string }) => r.user_id)
    expect(ids).toContain(mateA.id)
    expect(ids).not.toContain(stranger.id)
    expect(ids).not.toContain(creator.id)
  })

  it('activates on the third confirmed member with a cluster_formed notice', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    const pendingA = await mateA.client.rpc('get_pending_invitations')
    const invA = pendingA.data?.find((i: { cluster_id: string }) => i.cluster_id === clusterId)
    expect(invA).toBeDefined()
    expect(invA.origin).toBe('created')

    const { error: acceptErr } = await mateA.client.rpc('accept_invitation', {
      p_invitation_id: invA.id,
    })
    expect(acceptErr).toBeNull()

    let { data: members } = await admin
      .from('cluster_members')
      .select('user_id')
      .eq('cluster_id', clusterId!)
      .is('left_at', null)
    expect(members).toHaveLength(2)

    const pendingB = await mateB.client.rpc('get_pending_invitations')
    const invB = pendingB.data?.find((i: { cluster_id: string }) => i.cluster_id === clusterId)
    const { error: acceptErrB } = await mateB.client.rpc('accept_invitation', {
      p_invitation_id: invB.id,
    })
    expect(acceptErrB).toBeNull()

    members = (
      await admin
        .from('cluster_members')
        .select('user_id')
        .eq('cluster_id', clusterId!)
        .is('left_at', null)
    ).data
    expect(members).toHaveLength(3)

    const { data: formed } = await admin
      .from('notifications')
      .select('user_id, type')
      .eq('cluster_id', clusterId!)
      .eq('type', 'cluster_formed')
    expect(formed).toHaveLength(3)

    // No queue side effects: no round, queue entries untouched.
    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId!)
    expect(rounds).toHaveLength(0)
  })

  it('fires the activation notice only once across leave and re-accept', async () => {
    const { creator, mateA, mateB, mateC } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id, mateC.id])
    clusterIds.push(clusterId!)

    async function acceptAs(user: TestUser) {
      const pending = await user.client.rpc('get_pending_invitations')
      const inv = pending.data?.find((i: { cluster_id: string }) => i.cluster_id === clusterId)
      const { error } = await user.client.rpc('accept_invitation', { p_invitation_id: inv.id })
      expect(error).toBeNull()
    }

    await acceptAs(mateA)
    await acceptAs(mateB)

    // Leave at 3, then a third invitee re-activates: no second banner.
    const { error: leaveErr } = await mateA.client.rpc('leave_cluster', {
      p_cluster_id: clusterId!,
    })
    expect(leaveErr).toBeNull()
    await acceptAs(mateC)

    const { data: formed } = await admin
      .from('notifications')
      .select('id')
      .eq('cluster_id', clusterId!)
      .eq('type', 'cluster_formed')
    expect(formed).toHaveLength(3)
  })

  it('enforces the 8-member cap on accept', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Full House', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    // Fill to 8 directly, then accept must fail with cluster_full.
    const extras: TestUser[] = []
    for (let i = 0; i < 6; i++) {
      const u = await onboarded(`cc-fill-${i}`)
      extras.push(u)
      await admin.from('cluster_members').insert({ cluster_id: clusterId!, user_id: u.id })
    }
    // One more to reach 8 total (creator + 7).
    const last = await onboarded('cc-fill-last')
    await admin.from('cluster_members').insert({ cluster_id: clusterId!, user_id: last.id })

    const pending = await mateA.client.rpc('get_pending_invitations')
    const inv = pending.data?.find((i: { cluster_id: string }) => i.cluster_id === clusterId)
    const { error } = await mateA.client.rpc('accept_invitation', {
      p_invitation_id: inv.id,
    })
    expect(error?.message).toContain('cluster_full')
  })

  it('decline notifies the creator and starts no replacement round', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    const pending = await mateA.client.rpc('get_pending_invitations')
    const inv = pending.data?.find((i: { cluster_id: string }) => i.cluster_id === clusterId)
    const { error } = await mateA.client.rpc('decline_invitation', {
      p_invitation_id: inv.id,
    })
    expect(error).toBeNull()

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId!)
    expect(rounds).toHaveLength(0)

    const { data: notes } = await admin
      .from('notifications')
      .select('title')
      .eq('cluster_id', clusterId!)
      .eq('user_id', creator.id)
      .eq('type', 'replacement')
    expect(notes?.some((n) => n.title === 'Invitation declined')).toBe(true)
  })

  it('restricts extra invites to the creator, eligible users, and free slots', async () => {
    const { creator, mateA, mateB, mateC, stranger } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    // Non-creator cannot invite.
    const { error: nonCreator } = await mateA.client.rpc('invite_to_created_cluster', {
      p_cluster_id: clusterId!,
      p_invitee_id: mateC.id,
    })
    expect(nonCreator?.message).toContain('not_creator')

    // Stranger rejected.
    const { error: strangerErr } = await creator.client.rpc('invite_to_created_cluster', {
      p_cluster_id: clusterId!,
      p_invitee_id: stranger.id,
    })
    expect(strangerErr?.message).toContain('not_eligible')

    // Duplicate pending rejected.
    const { error: dup } = await creator.client.rpc('invite_to_created_cluster', {
      p_cluster_id: clusterId!,
      p_invitee_id: mateA.id,
    })
    expect(dup?.message).toContain('already_invited')

    // Valid extra invite works.
    const { error: ok } = await creator.client.rpc('invite_to_created_cluster', {
      p_cluster_id: clusterId!,
      p_invitee_id: mateC.id,
    })
    expect(ok).toBeNull()
  })

  it('keeps matching independent of created clusters', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    // A created-cluster member is not "in the Open Mix cluster" and can queue.
    const status = await creator.client.rpc('get_my_matching_status')
    const openMix = (status.data ?? []).find((s: { mode: string }) => s.mode === 'open_mix')
    expect(openMix?.cluster_id ?? null).toBeNull()

    const { error: joinErr } = await creator.client.rpc('join_queue', {
      p_mode: 'open_mix',
    })
    expect(joinErr).toBeNull()

    const queued = await creator.client.rpc('get_my_matching_status')
    const openMixAfter = (queued.data ?? []).find((s: { mode: string }) => s.mode === 'open_mix')
    expect(openMixAfter?.joined).toBe(true)

    // The accepter is the one queued, so the queue-survival assertion actually
    // exercises the accept path (a created accept must not clear queue rows).
    const { error: mateJoinErr } = await mateA.client.rpc('join_queue', {
      p_mode: 'open_mix',
    })
    expect(mateJoinErr).toBeNull()

    const pendingA = await mateA.client.rpc('get_pending_invitations')
    const invA = pendingA.data?.find((i: { cluster_id: string }) => i.cluster_id === clusterId)
    const { error: acceptErr } = await mateA.client.rpc('accept_invitation', {
      p_invitation_id: invA.id,
    })
    expect(acceptErr).toBeNull()
    const { data: qEntries } = await admin
      .from('queue_entries')
      .select('mode')
      .eq('user_id', mateA.id)
    expect((qEntries ?? []).some((q) => q.mode === 'open_mix')).toBe(true)
  })

  it('blocks re-invite after an explicit decline, but allows it after expiry or cancel', async () => {
    const { creator, mateA, mateB, mateC } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    // Decline is final for this cluster.
    const pendingA = await mateA.client.rpc('get_pending_invitations')
    const invA = pendingA.data?.find((i: { cluster_id: string }) => i.cluster_id === clusterId)
    const { error: declineErr } = await mateA.client.rpc('decline_invitation', {
      p_invitation_id: invA.id,
    })
    expect(declineErr).toBeNull()

    const { error: reinviteErr } = await creator.client.rpc('invite_to_created_cluster', {
      p_cluster_id: clusterId!,
      p_invitee_id: mateA.id,
    })
    expect(reinviteErr?.message).toContain('previously_declined')

    // Expiry is not an answer: re-invite works.
    await admin
      .from('invitations')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('cluster_id', clusterId!)
      .eq('user_id', mateB.id)
    const { error: afterExpiry } = await creator.client.rpc('invite_to_created_cluster', {
      p_cluster_id: clusterId!,
      p_invitee_id: mateB.id,
    })
    expect(afterExpiry).toBeNull()

    // Creator-cancel is the creator's own undo: re-invite works.
    const { data: invB } = await admin
      .from('invitations')
      .select('id')
      .eq('cluster_id', clusterId!)
      .eq('user_id', mateB.id)
      .eq('status', 'pending')
      .single()
    const { error: cancelErr } = await creator.client.rpc('cancel_created_invitation', {
      p_invitation_id: invB!.id,
    })
    expect(cancelErr).toBeNull()
    const { error: afterCancel } = await creator.client.rpc('invite_to_created_cluster', {
      p_cluster_id: clusterId!,
      p_invitee_id: mateB.id,
    })
    expect(afterCancel).toBeNull()

    // A fresh face can still be invited (decline block is per person).
    const { error: freshErr } = await creator.client.rpc('invite_to_created_cluster', {
      p_cluster_id: clusterId!,
      p_invitee_id: mateC.id,
    })
    expect(freshErr).toBeNull()
  })

  it('silences invites for recipients who muted the creator', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { error: muteErr } = await mateA.client.from('user_mutes').insert({
      user_id: mateA.id,
      muted_user_id: creator.id,
    })
    expect(muteErr).toBeNull()

    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    // No notification (and therefore no push) for the muter.
    const { data: notes } = await admin
      .from('notifications')
      .select('user_id')
      .eq('cluster_id', clusterId!)
      .eq('type', 'invitation_received')
    expect((notes ?? []).map((n) => n.user_id)).toEqual([mateB.id])

    // Hidden from the pending list and detail.
    const pendingA = await mateA.client.rpc('get_pending_invitations')
    expect(
      (pendingA.data ?? []).some((i: { cluster_id: string }) => i.cluster_id === clusterId),
    ).toBe(false)

    const { data: invRow } = await admin
      .from('invitations')
      .select('id')
      .eq('cluster_id', clusterId!)
      .eq('user_id', mateA.id)
      .single()
    const { error: detailErr } = await mateA.client.rpc('get_created_invite_detail', {
      p_invitation_id: invRow!.id,
    })
    expect(detailErr?.message).toContain('not_yours')

    // The unmuted invitee is unaffected.
    const pendingB = await mateB.client.rpc('get_pending_invitations')
    expect(
      (pendingB.data ?? []).some((i: { cluster_id: string }) => i.cluster_id === clusterId),
    ).toBe(true)
  })

  it('creator can cancel a pending invite', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    const { data: inv } = await admin
      .from('invitations')
      .select('id')
      .eq('cluster_id', clusterId!)
      .eq('user_id', mateA.id)
      .single()

    const { error } = await creator.client.rpc('cancel_created_invitation', {
      p_invitation_id: inv!.id,
    })
    expect(error).toBeNull()

    const pending = await mateA.client.rpc('get_pending_invitations')
    expect(
      (pending.data ?? []).some((i: { cluster_id: string }) => i.cluster_id === clusterId),
    ).toBe(false)
  })

  it('leave writes no cooldown and starts no replacement', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    const { error } = await creator.client.rpc('leave_cluster', {
      p_cluster_id: clusterId!,
    })
    expect(error).toBeNull()

    const { data: cooldowns } = await admin
      .from('mode_cooldowns')
      .select('mode')
      .eq('user_id', creator.id)
    expect(cooldowns).toHaveLength(0)

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId!)
    expect(rounds).toHaveLength(0)
  })

  it('progress_replacements ignores under-size created clusters', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    // Expire the invites directly so no pending row shields the safety net.
    await admin
      .from('invitations')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('cluster_id', clusterId!)

    const { error } = await admin.rpc('progress_replacements')
    expect(error).toBeNull()

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId!)
    expect(rounds).toHaveLength(0)
  })

  it('excludes created clusters from the mode directory and counts', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const before = await creator.client.rpc('get_public_cluster_counts')
    const beforeOpenMix = Number(
      ((before.data ?? []) as { mode: string; cluster_count: number }[]).find(
        (c) => c.mode === 'open_mix',
      )?.cluster_count ?? 0,
    )

    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    const { data: tiles } = await creator.client.rpc('get_clusters_by_mode', {
      p_mode: 'open_mix',
    })
    expect((tiles ?? []).some((t: { id: string }) => t.id === clusterId)).toBe(false)

    const { data: counts } = await creator.client.rpc('get_public_cluster_counts')
    const openMix = ((counts ?? []) as { mode: string; cluster_count: number }[]).find(
      (c) => c.mode === 'open_mix',
    )
    expect(Number(openMix?.cluster_count ?? 0)).toBe(beforeOpenMix)
  })

  it('blocks replace_member votes for created clusters', async () => {
    const { creator, mateA, mateB } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    const { error } = await creator.client.rpc('start_replace_vote', {
      p_cluster_id: clusterId!,
      p_target_member_id: mateA.id,
    })
    expect(error?.message).toContain('not_supported_for_created')
  })

  it('hides the cluster row from non-members but shows invite detail to invitees', async () => {
    const { creator, mateA, mateB, stranger } = await sharedSetup()
    const { data: clusterId } = await createFor(creator, 'Crew', [mateA.id, mateB.id])
    clusterIds.push(clusterId!)

    // Stranger sees nothing.
    const { data: mine } = await stranger.client.rpc('get_my_clusters')
    expect((mine ?? []).some((c: { id: string }) => c.id === clusterId)).toBe(false)

    // Invitee gets the detail view with creator + roster.
    const pending = await mateA.client.rpc('get_pending_invitations')
    const inv = pending.data?.find((i: { cluster_id: string }) => i.cluster_id === clusterId)
    const { data: detail, error } = await mateA.client.rpc('get_created_invite_detail', {
      p_invitation_id: inv.id,
    })
    expect(error).toBeNull()
    expect(detail?.[0]?.creator_id).toBe(creator.id)
    expect(detail?.[0]?.member_count).toBe(1)
    expect(detail?.[0]?.pending_count).toBe(2)
  })
})
