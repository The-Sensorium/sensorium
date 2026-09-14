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

describe('cluster calls RLS + RPC', () => {
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

  /** a + b are active members; c is not. */
  async function wireCluster(): Promise<{ a: TestUser; b: TestUser; c: TestUser; clusterId: string }> {
    const a = await member('calls-a')
    const b = await member('calls-b')
    const c = await member('calls-c')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    return { a, b, c, clusterId }
  }

  async function startCall(u: TestUser, clusterId: string): Promise<string> {
    const { data, error } = await u.client.rpc('start_call', { p_cluster_id: clusterId })
    expect(error).toBeNull()
    return data as string
  }

  it('a member starts a ringing call and members see it but outsiders and anon do not', async () => {
    const { a, b, c, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)

    const { data: row } = await admin.from('calls').select('status, initiated_by').eq('id', callId).single()
    expect(row?.status).toBe('ringing')
    expect(row?.initiated_by).toBe(a.id)

    const { data: memberRows } = await b.client.from('calls').select('id').eq('cluster_id', clusterId)
    expect((memberRows ?? []).map((r) => r.id)).toContain(callId)

    const { data: outsiderRows } = await c.client.from('calls').select('id').eq('cluster_id', clusterId)
    expect(outsiderRows ?? []).toHaveLength(0)

    const { data: anonRows } = await anon.from('calls').select('id').eq('cluster_id', clusterId)
    expect(anonRows ?? []).toHaveLength(0)
  })

  it('starting twice returns the same live call instead of a second row', async () => {
    const { a, b, clusterId } = await wireCluster()
    const first = await startCall(a, clusterId)
    const second = await startCall(b, clusterId)
    expect(second).toBe(first)

    const { data: rows } = await admin
      .from('calls')
      .select('id')
      .eq('cluster_id', clusterId)
      .neq('status', 'ended')
    expect((rows ?? []).map((r) => r.id)).toEqual([first])

    // Starting an already-live call also joins the caller, so the token
    // function's participant gate lets them onto the media plane.
    const { data: parts } = await admin
      .from('call_participants')
      .select('user_id')
      .eq('call_id', first)
      .is('left_at', null)
    expect((parts ?? []).map((p) => p.user_id).sort()).toEqual([a.id, b.id].sort())
  })

  it('a joiner flips the call to active and appears in participants', async () => {
    const { a, b, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)

    const { data, error } = await b.client.rpc('join_call', { p_call_id: callId })
    expect(error).toBeNull()
    expect(data).toBe(callId)

    const { data: row } = await admin.from('calls').select('status').eq('id', callId).single()
    expect(row?.status).toBe('active')

    const { data: parts } = await b.client.from('call_participants').select('user_id').eq('call_id', callId)
    expect((parts ?? []).map((p) => p.user_id).sort()).toEqual([a.id, b.id].sort())
  })

  it('non-members cannot start, join, end, or read calls', async () => {
    const { a, c, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)

    const { error: startErr } = await c.client.rpc('start_call', { p_cluster_id: clusterId })
    expect(startErr?.message).toMatch(/not_member/)

    const { error: joinErr } = await c.client.rpc('join_call', { p_call_id: callId })
    expect(joinErr?.message).toMatch(/not_member/)

    const { error: endErr } = await c.client.rpc('end_call', { p_call_id: callId })
    expect(endErr?.message).toMatch(/not_member/)

    const { error: leaveErr } = await c.client.rpc('leave_call', { p_call_id: callId })
    expect(leaveErr?.message).toMatch(/not_member/)

    const { data: partRows } = await c.client.from('call_participants').select('user_id').eq('call_id', callId)
    expect(partRows ?? []).toHaveLength(0)
  })

  it('leaving removes only the leaver; the call ends when the last participant leaves', async () => {
    const { a, b, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)
    await b.client.rpc('join_call', { p_call_id: callId })

    const { error: leaveErr } = await a.client.rpc('leave_call', { p_call_id: callId })
    expect(leaveErr).toBeNull()

    // a is out, but the call stays live and b is still in it.
    const { data: callRow } = await admin.from('calls').select('status').eq('id', callId).single()
    expect(callRow?.status).not.toBe('ended')
    const { data: aRow } = await admin
      .from('call_participants')
      .select('left_at')
      .eq('call_id', callId)
      .eq('user_id', a.id)
      .single()
    expect(aRow?.left_at).toBeTruthy()
    const { data: bRow } = await admin
      .from('call_participants')
      .select('left_at')
      .eq('call_id', callId)
      .eq('user_id', b.id)
      .single()
    expect(bRow?.left_at).toBeNull()

    // Last one out ends the call so the cluster no longer shows a live call.
    const { error: bLeaveErr } = await b.client.rpc('leave_call', { p_call_id: callId })
    expect(bLeaveErr).toBeNull()
    const { data: ended } = await admin.from('calls').select('status').eq('id', callId).single()
    expect(ended?.status).toBe('ended')
  })

  it('any member can end the call, join is then rejected, and a fresh call starts after', async () => {
    const { a, b, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)
    await b.client.rpc('join_call', { p_call_id: callId })

    const { error: endErr } = await b.client.rpc('end_call', { p_call_id: callId })
    expect(endErr).toBeNull()

    const { data: row } = await admin.from('calls').select('status, ended_at').eq('id', callId).single()
    expect(row?.status).toBe('ended')
    expect(row?.ended_at).toBeTruthy()

    const { error: joinErr } = await b.client.rpc('join_call', { p_call_id: callId })
    expect(joinErr?.message).toMatch(/call_ended/)

    const next = await startCall(a, clusterId)
    expect(next).not.toBe(callId)
  })

  it('the ninth open participant is rejected', async () => {
    const { a, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)

    for (let i = 0; i < 7; i++) {
      const m = await member(`calls-fill-${i}`)
      await admin.from('cluster_members').insert({ cluster_id: clusterId, user_id: m.id })
      const { error } = await m.client.rpc('join_call', { p_call_id: callId })
      expect(error).toBeNull()
    }

    const extra = await member('calls-extra')
    await admin.from('cluster_members').insert({ cluster_id: clusterId, user_id: extra.id })
    const { error } = await extra.client.rpc('join_call', { p_call_id: callId })
    expect(error?.message).toMatch(/call_full/)
  })

  it('calls cannot start in an archived cluster', async () => {
    const { a, clusterId } = await wireCluster()
    const { error: updateErr } = await admin.from('clusters').update({ status: 'archived' }).eq('id', clusterId)
    expect(updateErr).toBeNull()

    const { error } = await a.client.rpc('start_call', { p_cluster_id: clusterId })
    expect(error?.message).toMatch(/cluster_archived/)
  })

  async function expire(callId: string): Promise<void> {
    const { error } = await admin
      .from('calls')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', callId)
    expect(error).toBeNull()
  }

  it('join_call rejects a call past its time limit', async () => {
    const { a, b, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)
    await expire(callId)

    const { error } = await b.client.rpc('join_call', { p_call_id: callId })
    expect(error?.message).toMatch(/call_ended/)
  })

  it('end_expired_calls ends an expired call and releases its participants', async () => {
    const { a, b, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)
    await b.client.rpc('join_call', { p_call_id: callId })
    await expire(callId)

    const { error } = await admin.rpc('end_expired_calls')
    expect(error).toBeNull()

    const { data: callRow } = await admin.from('calls').select('status, ended_at').eq('id', callId).single()
    expect(callRow?.status).toBe('ended')
    expect(callRow?.ended_at).toBeTruthy()

    const { data: parts } = await admin.from('call_participants').select('left_at').eq('call_id', callId)
    expect((parts ?? []).every((p) => p.left_at !== null)).toBe(true)
  })

  it('start_call starts a fresh call once the previous one expired', async () => {
    const { a, clusterId } = await wireCluster()
    const first = await startCall(a, clusterId)
    await expire(first)

    const second = await startCall(a, clusterId)
    expect(second).not.toBe(first)

    const { data: live } = await admin
      .from('calls')
      .select('id')
      .eq('cluster_id', clusterId)
      .in('status', ['ringing', 'active'])
    expect((live ?? []).map((r) => r.id)).toEqual([second])
  })

  it('leaving the cluster releases the leaver from a live call but keeps it for others', async () => {
    const { a, b, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)
    await b.client.rpc('join_call', { p_call_id: callId })

    const { error } = await a.client.rpc('leave_cluster', { p_cluster_id: clusterId })
    expect(error).toBeNull()

    const { data: aRow } = await admin
      .from('call_participants')
      .select('left_at')
      .eq('call_id', callId)
      .eq('user_id', a.id)
      .single()
    expect(aRow?.left_at).toBeTruthy()

    const { data: callRow } = await admin.from('calls').select('status').eq('id', callId).single()
    expect(callRow?.status).not.toBe('ended')
  })

  it('ends a live call once its last participant departs the cluster', async () => {
    const { a, b, clusterId } = await wireCluster()
    const callId = await startCall(a, clusterId)
    await b.client.rpc('join_call', { p_call_id: callId })

    const leftAt = new Date().toISOString()
    await admin
      .from('cluster_members')
      .update({ left_at: leftAt })
      .eq('cluster_id', clusterId)
      .eq('user_id', a.id)
    await admin
      .from('cluster_members')
      .update({ left_at: leftAt })
      .eq('cluster_id', clusterId)
      .eq('user_id', b.id)

    const { data: callRow } = await admin.from('calls').select('status').eq('id', callId).single()
    expect(callRow?.status).toBe('ended')
  })
})
