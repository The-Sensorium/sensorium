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

function slot(offsetHours: number, lengthMinutes = 60): { starts_at: string; ends_at: string } {
  const starts = new Date(Date.now() + offsetHours * 3600_000)
  const ends = new Date(starts.getTime() + lengthMinutes * 60_000)
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() }
}

describe('cluster meetups RLS + RPC', () => {
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

  async function wireCluster(): Promise<{ members: TestUser[]; outsider: TestUser; clusterId: string }> {
    const members = [await member('meet-a'), await member('meet-b'), await member('meet-c'), await member('meet-d')]
    const outsider = await member('meet-out')
    const clusterId = await createCluster(admin, { memberIds: members.map((m) => m.id), status: 'active' })
    clusterIds.push(clusterId)
    return { members, outsider, clusterId }
  }

  async function createMeetup(u: TestUser, clusterId: string): Promise<string> {
    const closes = new Date(Date.now() + 3600_000).toISOString()
    const { data, error } = await u.client.rpc('create_meetup', {
      p_cluster_id: clusterId,
      p_slots: [slot(5), slot(7), slot(9)],
      p_voting_closes_at: closes,
    })
    expect(error).toBeNull()
    return data as string
  }

  it('a member creates a meetup with slots and other members see it but outsiders and anon do not', async () => {
    const { members, outsider, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)

    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId)
    expect(slots ?? []).toHaveLength(3)

    const { data: memberRows } = await members[1].client.from('meetups').select('id').eq('cluster_id', clusterId)
    expect((memberRows ?? []).map((r) => r.id)).toContain(meetupId)

    const { data: outsiderRows } = await outsider.client.from('meetups').select('id').eq('cluster_id', clusterId)
    expect(outsiderRows ?? []).toHaveLength(0)

    const { data: anonRows } = await anon.from('meetups').select('id').eq('cluster_id', clusterId)
    expect(anonRows ?? []).toHaveLength(0)

    const { data: invites } = await admin
      .from('notifications')
      .select('user_id,title')
      .eq('cluster_id', clusterId)
      .eq('type', 'meetup_invite')
    expect((invites ?? []).map((n) => n.user_id).sort()).toEqual(
      [members[1].id, members[2].id, members[3].id].sort(),
    )
    for (const n of invites ?? []) {
      expect(n.title).toBe("Vote for this week's Cluster Meetup")
    }
  })

  it('non-members cannot create a meetup', async () => {
    const { outsider, clusterId } = await wireCluster()
    const closes = new Date(Date.now() + 3600_000).toISOString()
    const { error } = await outsider.client.rpc('create_meetup', {
      p_cluster_id: clusterId,
      p_slots: [slot(5), slot(7)],
      p_voting_closes_at: closes,
    })
    expect(error?.message).toMatch(/not_member/)
  })

  it('a second meetup cannot start while one is active', async () => {
    const { members, clusterId } = await wireCluster()
    await createMeetup(members[0], clusterId)
    const closes = new Date(Date.now() + 3600_000).toISOString()
    const { error } = await members[1].client.rpc('create_meetup', {
      p_cluster_id: clusterId,
      p_slots: [slot(6), slot(8)],
      p_voting_closes_at: closes,
    })
    expect(error?.message).toMatch(/meetup_active/)
  })

  it('accepts a fifth custom slot but rejects a sixth', async () => {
    const { members, clusterId } = await wireCluster()
    const closes = new Date(Date.now() + 3600_000).toISOString()
    const five = [slot(5), slot(7), slot(9), slot(11), slot(13)]
    const { data, error } = await members[0].client.rpc('create_meetup', {
      p_cluster_id: clusterId,
      p_slots: five,
      p_voting_closes_at: closes,
    })
    expect(error).toBeNull()
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', data as string)
    expect(slots ?? []).toHaveLength(5)

    await admin.from('meetups').delete().eq('id', data as string)
    const six = [...five, slot(15)]
    const { error: sixth } = await members[0].client.rpc('create_meetup', {
      p_cluster_id: clusterId,
      p_slots: six,
      p_voting_closes_at: closes,
    })
    expect(sixth?.message).toMatch(/invalid_slots/)
  })

  it('rejects a single-slot ballot and a sixth slot', async () => {
    const { members, clusterId } = await wireCluster()
    const closes = new Date(Date.now() + 3600_000).toISOString()
    const { error: one } = await members[0].client.rpc('create_meetup', {
      p_cluster_id: clusterId,
      p_slots: [slot(5)],
      p_voting_closes_at: closes,
    })
    expect(one?.message).toMatch(/invalid_slots/)

    const six = [slot(5), slot(7), slot(9), slot(11), slot(13), slot(15)]
    const { error: sixth } = await members[0].client.rpc('create_meetup', {
      p_cluster_id: clusterId,
      p_slots: six,
      p_voting_closes_at: closes,
    })
    expect(sixth?.message).toMatch(/invalid_slots/)
  })

  it('three votes on one slot confirm the meetup and fan out a confirmation', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id

    for (const m of [members[0], members[1], members[2]]) {
      const { error } = await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
      expect(error).toBeNull()
    }

    const { data: row } = await admin.from('meetups').select('status, confirmed_slot_id').eq('id', meetupId).single()
    expect(row?.status).toBe('confirmed')
    expect(row?.confirmed_slot_id).toBe(first)

    const { data: notes } = await admin
      .from('notifications')
      .select('id')
      .eq('type', 'meetup_confirmed')
      .eq('cluster_id', clusterId)
    expect((notes ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('a member can change their vote before quorum', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const ids = (slots as Array<{ id: string }>).map((s) => s.id)

    const { error } = await members[0].client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: ids[0] })
    expect(error).toBeNull()
    const { error: change } = await members[0].client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: ids[1] })
    expect(change).toBeNull()

    const { data: votes } = await admin.from('meetup_votes').select('slot_id').eq('meetup_id', meetupId)
    expect(votes ?? []).toHaveLength(1)
    expect((votes as Array<{ slot_id: string }>)[0].slot_id).toBe(ids[1])

    const { data: row } = await admin.from('meetups').select('status').eq('id', meetupId).single()
    expect(row?.status).toBe('voting')
  })

  it('voting closes after confirmation', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id

    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }
    const { error } = await members[3].client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    expect(error?.message).toMatch(/voting_closed/)
  })

  it('rsvp and check-in track attendance', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }

    const { error } = await members[0].client.rpc('rsvp_meetup', { p_meetup_id: meetupId, p_status: 'going' })
    expect(error).toBeNull()
    const { error: check } = await members[0].client.rpc('check_in_meetup', { p_meetup_id: meetupId })
    expect(check).toBeNull()

    const { data: rsvp } = await admin
      .from('meetup_rsvps')
      .select('status, checked_in_at')
      .eq('meetup_id', meetupId)
      .eq('user_id', members[0].id)
      .single()
    expect(rsvp?.status).toBe('going')
    expect(rsvp?.checked_in_at).not.toBeNull()
  })

  it('feedback opens only after the meetup starts', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { error: early } = await members[0].client.rpc('submit_meetup_feedback', {
      p_meetup_id: meetupId,
      p_rating: 'loved',
      p_meet_again: 'yes',
    })
    expect(early?.message).toMatch(/feedback_not_open/)

    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }
    await admin.from('meetups').update({ starts_at: new Date(Date.now() - 3600_000).toISOString() }).eq('id', meetupId)
    const { error } = await members[0].client.rpc('submit_meetup_feedback', {
      p_meetup_id: meetupId,
      p_rating: 'loved',
      p_meet_again: 'yes',
    })
    expect(error).toBeNull()
  })

  it('get_meetup_state returns slots with counts and the caller vote', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    await members[0].client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })

    const { data, error } = await members[0].client.rpc('get_meetup_state', { p_meetup_id: meetupId })
    expect(error).toBeNull()
    const state = data as { slots: Array<{ vote_count: number }>; my_slot_id: string; quorum: number; voters: Array<{ slot_id: string; user_id: string }> }
    expect(state.quorum).toBe(3)
    expect(state.my_slot_id).toBe(first)
    expect(state.slots.reduce((n, s) => n + s.vote_count, 0)).toBe(1)
    expect(state.voters).toHaveLength(1)
    expect(state.voters[0]).toMatchObject({ slot_id: first, user_id: members[0].id })
  })

  it('expired voting without quorum cancels via expire_meetups', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    await admin.from('meetups').update({ voting_closes_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', meetupId)
    const { error } = await admin.rpc('expire_meetups')
    expect(error).toBeNull()
    const { data: row } = await admin.from('meetups').select('status,cancelled_reason').eq('id', meetupId).single()
    expect(row?.status).toBe('cancelled')
    expect(row?.cancelled_reason).toBe('expired')
  })

  it('expire_meetups completes a confirmed meetup once ends_at passes, unlocking the next proposal', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }
    await admin
      .from('meetups')
      .update({
        starts_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        ends_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq('id', meetupId)
    const { error } = await admin.rpc('expire_meetups')
    expect(error).toBeNull()
    const { data: row } = await admin.from('meetups').select('status,completed_at').eq('id', meetupId).single()
    expect(row?.status).toBe('completed')
    expect(row?.completed_at).not.toBeNull()

    const closes = new Date(Date.now() + 3600_000).toISOString()
    const { error: next } = await members[0].client.rpc('create_meetup', {
      p_cluster_id: clusterId,
      p_slots: [slot(5), slot(7)],
      p_voting_closes_at: closes,
    })
    expect(next).toBeNull()
  })

  it('expire_meetups waits while a cluster call is still live', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }
    await admin
      .from('meetups')
      .update({
        starts_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        ends_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq('id', meetupId)

    const { data: callId, error: callErr } = await members[0].client.rpc('start_call', { p_cluster_id: clusterId })
    expect(callErr).toBeNull()
    const { error } = await admin.rpc('expire_meetups')
    expect(error).toBeNull()
    const { data: held } = await admin.from('meetups').select('status').eq('id', meetupId).single()
    expect(held?.status).toBe('confirmed')

    const { error: leaveErr } = await members[0].client.rpc('leave_call', { p_call_id: callId as string })
    expect(leaveErr).toBeNull()
    const { error: again } = await admin.rpc('expire_meetups')
    expect(again).toBeNull()
    const { data: done } = await admin.from('meetups').select('status').eq('id', meetupId).single()
    expect(done?.status).toBe('completed')
  })

  it('expire_meetups ignores a live call row past its own expiry', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }
    await admin
      .from('meetups')
      .update({
        starts_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        ends_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq('id', meetupId)

    const { data: callId, error: callErr } = await members[0].client.rpc('start_call', { p_cluster_id: clusterId })
    expect(callErr).toBeNull()
    await admin.from('calls').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', callId as string)
    const { error } = await admin.rpc('expire_meetups')
    expect(error).toBeNull()
    const { data: row } = await admin.from('meetups').select('status').eq('id', meetupId).single()
    expect(row?.status).toBe('completed')
  })

  it('only the creator can withdraw while voting', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)

    const { error: outsiderErr } = await members[1].client.rpc('cancel_meetup', { p_meetup_id: meetupId })
    expect(outsiderErr?.message).toMatch(/not_creator/)

    const { error } = await members[0].client.rpc('cancel_meetup', { p_meetup_id: meetupId })
    expect(error).toBeNull()
    const { data: row } = await admin.from('meetups').select('status,cancelled_reason').eq('id', meetupId).single()
    expect(row?.status).toBe('cancelled')
    expect(row?.cancelled_reason).toBe('withdrawn')
  })

  it('meetup invites follow the meetups pref, not the votes pref', async () => {
    const { members, clusterId } = await wireCluster()
    // member[1] opts out of meetups; member[2] opts out of governance votes.
    // meetups stays on by default, so only member[1] should miss the invite.
    const { error: prefErr } = await admin.from('notification_prefs').insert({
      user_id: members[1].id,
      cluster_id: clusterId,
      meetups: false,
    })
    expect(prefErr).toBeNull()
    const { error: votesErr } = await admin.from('notification_prefs').insert({
      user_id: members[2].id,
      cluster_id: clusterId,
      votes: false,
    })
    expect(votesErr).toBeNull()

    await createMeetup(members[0], clusterId)

    const { data: hidden } = await members[1].client.rpc('get_my_notifications')
    expect(((hidden ?? []) as Array<{ type: string }>).filter((n) => n.type === 'meetup_invite')).toHaveLength(0)

    const { data: shown } = await members[2].client.rpc('get_my_notifications')
    expect(((shown ?? []) as Array<{ type: string }>).filter((n) => n.type === 'meetup_invite')).toHaveLength(1)
  })

  it('a confirmed meetup cannot be cancelled unilaterally', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }

    const { error } = await members[0].client.rpc('cancel_meetup', { p_meetup_id: meetupId })
    expect(error?.message).toMatch(/cannot_cancel/)
    const { data: row } = await admin.from('meetups').select('status').eq('id', meetupId).single()
    expect(row?.status).toBe('confirmed')
  })

  it('winning voters seed as going and a non-voter can still RSVP in', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }

    const { data: seeded } = await admin.from('meetup_rsvps').select('user_id').eq('meetup_id', meetupId).eq('status', 'going')
    expect((seeded ?? []).map((r) => r.user_id).sort()).toEqual([members[0].id, members[1].id, members[2].id].sort())

    const { error } = await members[3].client.rpc('rsvp_meetup', { p_meetup_id: meetupId, p_status: 'going' })
    expect(error).toBeNull()

    const { data: state, error: stateErr } = await members[3].client.rpc('get_meetup_state', { p_meetup_id: meetupId })
    expect(stateErr).toBeNull()
    const typed = state as { going_count: number; my_rsvp: string; my_slot_id: null; going_user_ids: string[] }
    expect(typed.going_count).toBe(4)
    expect(typed.my_rsvp).toBe('going')
    expect(typed.my_slot_id).toBeNull()
    expect([...typed.going_user_ids].sort()).toEqual(members.map((m) => m.id).sort())
  })

  it('declining removes the member from the going list in get_meetup_state', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }

    const { error } = await members[2].client.rpc('rsvp_meetup', { p_meetup_id: meetupId, p_status: 'declined' })
    expect(error).toBeNull()

    const { data, error: stateErr } = await members[0].client.rpc('get_meetup_state', { p_meetup_id: meetupId })
    expect(stateErr).toBeNull()
    const typed = data as { going_count: number; going_user_ids: string[] }
    expect(typed.going_count).toBe(2)
    expect([...typed.going_user_ids].sort()).toEqual([members[0].id, members[1].id].sort())
  })

  it('checking in then declining clears the check-in from attendance', async () => {
    const { members, clusterId } = await wireCluster()
    const meetupId = await createMeetup(members[0], clusterId)
    const { data: slots } = await admin.from('meetup_slots').select('id').eq('meetup_id', meetupId).order('starts_at')
    const first = (slots as Array<{ id: string }>)[0].id
    for (const m of [members[0], members[1], members[2]]) {
      await m.client.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: first })
    }

    const { error: check } = await members[0].client.rpc('check_in_meetup', { p_meetup_id: meetupId })
    expect(check).toBeNull()
    const { error: decline } = await members[0].client.rpc('rsvp_meetup', { p_meetup_id: meetupId, p_status: 'declined' })
    expect(decline).toBeNull()

    const { data: rsvp } = await admin
      .from('meetup_rsvps')
      .select('status, checked_in_at')
      .eq('meetup_id', meetupId)
      .eq('user_id', members[0].id)
      .single()
    expect(rsvp?.status).toBe('declined')
    expect(rsvp?.checked_in_at).toBeNull()

    const { data, error: stateErr } = await members[1].client.rpc('get_meetup_state', { p_meetup_id: meetupId })
    expect(stateErr).toBeNull()
    const typed = data as { going_count: number; checked_in_count: number; going_user_ids: string[] }
    expect(typed.going_count).toBe(2)
    expect(typed.checked_in_count).toBe(0)
    expect([...typed.going_user_ids].sort()).toEqual([members[1].id, members[2].id].sort())
  })
})
