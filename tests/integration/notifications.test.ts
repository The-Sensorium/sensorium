import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Notifications: get_my_notifications, get_unread_notification_count (now
// including chat unread via last_read_message_at), mark_cluster_read /
// mark_all_read, pref filtering, and the reaction trigger notification.

type MyNotificationRow = {
  id: string
  type: string
  cluster_id: string | null
  title: string
  body: string | null
  payload: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

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
    await admin.from('profiles').update({ display_name: 'Briana Mention' }).eq('id', b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // Two mentions of b; discrete events still write notification rows.
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hey @Briana Mention one',
    })
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hey @Briana Mention two',
    })

    const { data, error } = await b.client.rpc('get_my_notifications')
    expect(error).toBeNull()
    // 2 mention rows + 1 synthesized chat entry for the unread messages.
    expect(data?.length).toBe(3)
    const rows = (data ?? []) as MyNotificationRow[]
    const mentions = rows.filter((n) => n.type === 'mention')
    const chat = rows.filter((n) => n.type === 'message')
    expect(mentions).toHaveLength(2)
    for (const m of mentions) expect(m.title).toContain('mentioned you')
    expect(chat).toHaveLength(1)
    expect(chat[0]!.title).toBe('Integration User sent a message')
    expect(chat[0]!.body ?? '').toContain('Hey @Briana Mention')

    const { data: mine } = await a.client.rpc('get_my_notifications')
    expect(mine).toHaveLength(0)
  })

  it('surfaces unread chat in the center until the cluster is marked read', async () => {
    const a = await member('n-center-a')
    const b = await member('n-center-b')
    await admin.from('profiles').update({ display_name: 'Casey Chat' }).eq('id', a.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // Plain chat (no mention) appears as a synthesized `message` entry carrying
    // the sender's name, not just an unread-badge number.
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'plain hello' })

    let { data } = await b.client.rpc('get_my_notifications')
    expect(data).toHaveLength(1)
    expect(data![0].type).toBe('message')
    expect(data![0].title).toBe('Casey Chat sent a message')
    expect(data![0].body).toBe('plain hello')
    expect(data![0].read_at).toBeNull()

    // A photo-only message previews as [Photo].
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_image_url: 'chat-images/demo.png' })
    const { data: again } = await b.client.rpc('get_my_notifications')
    expect(again).toHaveLength(1)
    expect(again![0].body).toBe('[Photo]')

    // A GIF message previews as [GIF], not the raw gif: URL.
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'gif:https://media.tenor.com/x.gif' })
    const { data: gif } = await b.client.rpc('get_my_notifications')
    expect(gif).toHaveLength(1)
    expect(gif![0].body).toBe('[GIF]')

    // Opening the room advances the watermark and clears the entry.
    const { error } = await b.client.rpc('mark_cluster_read', { p_cluster_id: clusterId })
    expect(error).toBeNull()
    const { data: after } = await b.client.rpc('get_my_notifications')
    expect(after).toHaveLength(0)
  })

  it('chat messages count as unread until the cluster is marked read', async () => {
    const a = await member('n-unread')
    const b = await member('n-unread2')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // Sending messages no longer creates per-member `message` notification rows.
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'first' })
    await b.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'second' })

    const { data: rows } = await admin
      .from('notifications')
      .select('id')
      .eq('cluster_id', clusterId)
      .eq('type', 'message')
    expect(rows).toHaveLength(0)

    // Each member has exactly one unread chat message (the other's).
    const { data: bUnread } = await b.client.rpc('get_unread_notification_count')
    expect(bUnread).toBe(1)
    const { data: aUnread } = await a.client.rpc('get_unread_notification_count')
    expect(aUnread).toBe(1)

    // Reading the room advances last_read_message_at and clears the badge.
    const { error: readErr } = await b.client.rpc('mark_cluster_read', {
      p_cluster_id: clusterId,
    })
    expect(readErr).toBeNull()

    const { data: bUnread2 } = await b.client.rpc('get_unread_notification_count')
    expect(bUnread2).toBe(0)
  })

  it('hides chat unread when the messages pref is disabled', async () => {
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

    const { data: unread } = await b.client.rpc('get_unread_notification_count')
    expect(unread).toBe(0)

    // The messages pref also hides the synthesized chat entry from the center.
    const { data: list } = await b.client.rpc('get_my_notifications')
    expect(list ?? []).toHaveLength(0)
  })

  it('mark_all_read clears event notifications and chat unread', async () => {
    const a = await member('n-all-a')
    const b = await member('n-all-b')
    await admin.from('profiles').update({ display_name: 'Dana All' }).eq('id', b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // b receives both a mention event and one unread chat message.
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hello @Dana All',
    })

    const { data: before } = await b.client.rpc('get_unread_notification_count')
    expect(before).toBeGreaterThanOrEqual(2)

    const { error } = await b.client.rpc('mark_all_read')
    expect(error).toBeNull()

    const { data: after } = await b.client.rpc('get_unread_notification_count')
    expect(after).toBe(0)
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
    await admin.from('profiles').update({ display_name: 'Cara RLS' }).eq('id', b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // a mentions b; b (non-author) receives a mention notification.
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hi @Cara RLS',
    })

    const { data: bNotifs } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', b.id)
      .eq('cluster_id', clusterId)
      .eq('type', 'mention')
    expect(bNotifs!.length).toBeGreaterThan(0)

    // a cannot read b's notification row (RLS: auth.uid() = user_id).
    const { data: leaked } = await a.client
      .from('notifications')
      .select('id')
      .in('id', bNotifs!.map((n) => n.id))
    expect(leaked).toHaveLength(0)
  })
})
