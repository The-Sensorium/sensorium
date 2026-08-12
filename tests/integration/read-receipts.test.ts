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
// last_read_message_at watermark (0048), so a member can see who has caught up
// to a message. The members-only guard must stay intact.

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
})