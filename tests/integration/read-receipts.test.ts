import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Read receipts: get_member_profiles now exposes each active member's
// last_read_message_at watermark (0048), and get_message_reads (0049) exposes
// immutable per-message read timestamps, so a member can see who has caught up
// to a message and *when* they first read it. The members-only guard must stay
// intact.

describe('read receipts', () => {
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
    await onboardUser(admin, u.id, { dob: '1995-01-15' })
    return u
  }

  async function readPositions(
    viewer: TestUser,
    clusterId: string,
  ): Promise<Map<string, string>> {
    const { data, error } = await viewer.client.rpc('get_member_profiles', {
      p_cluster_id: clusterId,
    })
    expect(error).toBeNull()
    const map = new Map<string, string>()
    for (const row of data ?? []) map.set(row.id, row.last_read_message_at)
    return map
  }

  async function messageCreatedAt(viewer: TestUser, messageId: string): Promise<string> {
    const { data, error } = await viewer
      .client
      .from('messages')
      .select('created_at')
      .eq('id', messageId)
      .single()
    expect(error).toBeNull()
    return data!.created_at
  }

  it('shows a member as having seen a message once they catch up', async () => {
    const a = await member('rr-seen-a')
    const b = await member('rr-seen-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: messageId, error: sendErr } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'seen me',
    })
    expect(sendErr).toBeNull()
    const createdAt = await messageCreatedAt(a, messageId!)

    // Before b reads, their watermark sits before the message.
    let positions = await readPositions(a, clusterId)
    expect(positions.get(b.id)).toBeDefined()
    expect(positions.get(b.id)!.localeCompare(createdAt)).toBeLessThan(0)

    // b catches up; a sees the advanced watermark.
    const { error: readErr } = await b.client.rpc('mark_cluster_read', {
      p_cluster_id: clusterId,
    })
    expect(readErr).toBeNull()

    positions = await readPositions(a, clusterId)
    expect(positions.get(b.id)!.localeCompare(createdAt)).toBeGreaterThanOrEqual(0)
  })

  it('does not count a message sent after a member caught up', async () => {
    const a = await member('rr-later-a')
    const b = await member('rr-later-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await b.client.rpc('mark_cluster_read', { p_cluster_id: clusterId })

    const { data: messageId } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'too late',
    })
    const createdAt = await messageCreatedAt(a, messageId!)

    const positions = await readPositions(a, clusterId)
    expect(positions.get(b.id)!.localeCompare(createdAt)).toBeLessThan(0)
  })

  it('returns no read positions to a signed-in non-member', async () => {
    const a = await member('rr-gate-a')
    const outsider = await member('rr-gate-out')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data, error } = await outsider.client.rpc('get_member_profiles', {
      p_cluster_id: clusterId,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('freezes a reader\'s per-message read time once recorded (does not march to now)', async () => {
    const a = await member('rr-stable-a')
    const b = await member('rr-stable-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: messageId } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'freeze me',
    })

    await b.client.rpc('mark_cluster_read', { p_cluster_id: clusterId })
    await new Promise((resolve) => setTimeout(resolve, 20))

    const { data: first, error } = await a.client.rpc('get_message_reads', {
      p_message_id: messageId,
    })
    expect(error).toBeNull()
    expect(first).toHaveLength(1)
    expect(first![0].id).toBe(b.id)
    const frozenReadAt = first![0].read_at

    // b keeps the room open and reads again; their watermark advances but the
    // per-message read time must not.
    await b.client.rpc('mark_cluster_read', { p_cluster_id: clusterId })

    const { data: second } = await a.client.rpc('get_message_reads', {
      p_message_id: messageId,
    })
    expect(second![0].read_at).toBe(frozenReadAt)
  })

  it('hides message reads from a signed-in non-member', async () => {
    const a = await member('rr-read-gate-a')
    const b = await member('rr-read-gate-b')
    const outsider = await member('rr-read-gate-out')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: messageId } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'guarded',
    })
    await b.client.rpc('mark_cluster_read', { p_cluster_id: clusterId })

    const { data, error } = await outsider.client.rpc('get_message_reads', {
      p_message_id: messageId,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})
