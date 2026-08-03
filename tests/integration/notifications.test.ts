import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Notifications: get_my_notifications, get_unread_notification_count, pref
// filtering, and the reaction trigger notification.

describe('notifications', () => {
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

  it('returns only the caller notifications, newest first', async () => {
    const a = await member('n-a')
    const b = await member('n-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // A message notification for a; a message notification for b.
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'first',
    })
    await b.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'second',
    })

    const { data, error } = await a.client.rpc('get_my_notifications')
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
    expect(data![0].title).toContain('sent a message')

    const { data: mine } = await b.client.rpc('get_my_notifications')
    expect(mine).toHaveLength(1)
  })

  it('tracks unread count and updates it when notifications are read', async () => {
    const a = await member('n-unread')
    const b = await member('n-unread2')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'hi' })

    const { data: unread } = await b.client.rpc('get_unread_notification_count')
    expect(unread).toBe(1)

    // b marks their notifications read.
    const { error: readErr } = await admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', b.id)
    expect(readErr).toBeNull()

    const { data: unread2 } = await b.client.rpc('get_unread_notification_count')
    expect(unread2).toBe(0)
  })

  it('hides notifications disabled in prefs', async () => {
    const a = await member('n-pref')
    const b = await member('n-pref2')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'hi' })

    // b disables message notifications for this cluster.
    const { error: prefErr } = await admin.from('notification_prefs').insert({
      user_id: b.id,
      cluster_id: clusterId,
      messages: false,
    })
    expect(prefErr).toBeNull()

    const { data: list } = await b.client.rpc('get_my_notifications')
    expect(list).toHaveLength(0)

    const { data: unread } = await b.client.rpc('get_unread_notification_count')
    expect(unread).toBe(0)
  })

  it('a reaction to a message notifies its author', async () => {
    const a = await member('n-reac')
    const b = await member('n-reac2')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: messageId } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'react to me',
    })

    const { error: reactErr } = await b.client.from('message_reactions').insert({
      message_id: messageId,
      user_id: b.id,
      emoji: '❤️',
    })
    expect(reactErr).toBeNull()

    const { data: notifs } = await admin
      .from('notifications')
      .select('user_id, payload')
      .eq('type', 'reaction')
      .eq('cluster_id', clusterId)
    expect(notifs).toHaveLength(1)
    expect(notifs![0].user_id).toBe(a.id)
    expect(notifs![0].payload?.message_id).toBe(messageId)
  })

  it('a member cannot see another member notifications through RLS', async () => {
    const a = await member('n-rls')
    const b = await member('n-rls2')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // a messages the cluster; b (non-author) receives a notification.
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'hi' })

    const { data: bNotifs } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', b.id)
      .eq('cluster_id', clusterId)
      .eq('type', 'message')
    expect(bNotifs!.length).toBeGreaterThan(0)

    // a cannot read b's notification row (RLS: auth.uid() = user_id).
    const { data: leaked } = await a.client
      .from('notifications')
      .select('id')
      .in('id', bNotifs!.map((n) => n.id))
    expect(leaked).toHaveLength(0)
  })
})
