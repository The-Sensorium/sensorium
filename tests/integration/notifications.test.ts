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
    // 2 mention rows. Plain chat no longer synthesizes a center entry; unread
    // chat lives in get_unread_chat_counts (see below).
    expect(data?.length).toBe(2)
    const rows = (data ?? []) as MyNotificationRow[]
    const mentions = rows.filter((n) => n.type === 'mention')
    const chat = rows.filter((n) => n.type === 'message')
    expect(mentions).toHaveLength(2)
    for (const m of mentions) expect(m.title).toContain('mentioned you')
    expect(chat).toHaveLength(0)

    // The same two messages still count as unread chat for the card badges.
    const { data: counts } = await b.client.rpc('get_unread_chat_counts')
    expect(counts).toHaveLength(1)
    expect(counts![0].cluster_id).toBe(clusterId)
    expect(Number(counts![0].unread_count)).toBe(2)

    const { data: mine } = await a.client.rpc('get_my_notifications')
    expect(mine).toHaveLength(0)
  })

  it('keeps plain chat out of the center; counts carry the unread', async () => {
    const a = await member('n-center-a')
    const b = await member('n-center-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // Plain chat (no mention) writes no center entry for the recipient.
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'plain hello' })

    const { data } = await b.client.rpc('get_my_notifications')
    expect(data).toHaveLength(0)

    // ... but the card counts RPC reports it.
    const { data: counts } = await b.client.rpc('get_unread_chat_counts')
    expect(counts).toHaveLength(1)
    expect(Number(counts![0].unread_count)).toBe(1)

    // Photo and GIF messages count the same way.
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_image_url: 'chat-images/demo.png' })
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'gif:https://media.tenor.com/x.gif' })
    const { data: counts3 } = await b.client.rpc('get_unread_chat_counts')
    expect(Number(counts3![0].unread_count)).toBe(3)

    // Opening the room advances the watermark and clears the counts.
    const { error } = await b.client.rpc('mark_cluster_read', { p_cluster_id: clusterId })
    expect(error).toBeNull()
    const { data: after } = await b.client.rpc('get_unread_chat_counts')
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

    // Each member has exactly one unread chat message (the other's), visible
    // in the card counts but excluded from the header badge.
    const { data: bCounts } = await b.client.rpc('get_unread_chat_counts')
    expect(Number(bCounts![0].unread_count)).toBe(1)
    const { data: bUnread } = await b.client.rpc('get_unread_notification_count')
    expect(bUnread).toBe(0)
    const { data: aUnread } = await a.client.rpc('get_unread_notification_count')
    expect(aUnread).toBe(0)

    // Reading the room advances last_read_message_at and clears the counts.
    const { error: readErr } = await b.client.rpc('mark_cluster_read', {
      p_cluster_id: clusterId,
    })
    expect(readErr).toBeNull()

    const { data: bCounts2 } = await b.client.rpc('get_unread_chat_counts')
    expect(bCounts2 ?? []).toHaveLength(0)
  })

  it('header badge excludes chat; card counts carry the exact number', async () => {
    const a = await member('n-match-a')
    const b = await member('n-match-b')
    await admin.from('profiles').update({ display_name: 'Mina Match' }).eq('id', a.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'one' })
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'two' })
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'three' })

    // No chat rows in the center; the counts RPC carries the exact number and
    // the header badge stays quiet (chat lives on the cards).
    const { data: list } = await b.client.rpc('get_my_notifications')
    expect(list ?? []).toHaveLength(0)
    const { data: counts } = await b.client.rpc('get_unread_chat_counts')
    expect(counts).toHaveLength(1)
    expect(Number(counts![0].unread_count)).toBe(3)
    const { data: count } = await b.client.rpc('get_unread_notification_count')
    expect(count).toBe(0)
  })

  it('does not badge a hidden message the center withholds', async () => {
    const a = await member('n-hidden-a')
    const b = await member('n-hidden-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: hiddenId } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'hidden content',
    })
    await admin.from('messages').update({ moderation_status: 'rejected' }).eq('id', hiddenId)

    const { data: list } = await b.client.rpc('get_my_notifications')
    const { data: count } = await b.client.rpc('get_unread_notification_count')
    expect(list ?? []).toHaveLength(0)
    expect(count).toBe(0)
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

    // The messages pref also hides the cluster from the card counts.
    const { data: counts } = await b.client.rpc('get_unread_chat_counts')
    expect(counts ?? []).toHaveLength(0)

    // The messages pref also hides the synthesized chat entry from the center.
    const { data: list } = await b.client.rpc('get_my_notifications')
    expect(list ?? []).toHaveLength(0)
  })

  it('hides an @everyone broadcast when the mentions pref is disabled', async () => {
    const a = await member('n-ev-pref')
    const b = await member('n-ev-pref2')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // b disables mention notifications for this cluster.
    const { error: prefErr } = await admin.from('notification_prefs').insert({
      user_id: b.id,
      cluster_id: clusterId,
      mentions: false,
    })
    expect(prefErr).toBeNull()

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'Hi @everyone' })

    // Fan-out is read-gated, so the row is still written ...
    const { data: stored } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', b.id)
      .eq('cluster_id', clusterId)
      .eq('type', 'mention')
    expect(stored ?? []).toHaveLength(1)

    // ... but b sees no mention rows in the center.
    const { data: list } = await b.client.rpc('get_my_notifications')
    const mentions = ((list ?? []) as MyNotificationRow[]).filter((n) => n.type === 'mention')
    expect(mentions).toHaveLength(0)
  })

  it('mark_all_read deletes event notifications and clears chat unread', async () => {
    const a = await member('n-all-a')
    const b = await member('n-all-b')
    await admin.from('profiles').update({ display_name: 'Dana All' }).eq('id', b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // b receives both a mention event and one unread chat message. The badge
    // counts the mention only; chat lives on the cards.
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hello @Dana All',
    })

    const { data: before } = await b.client.rpc('get_unread_notification_count')
    expect(before).toBe(1)

    const { error } = await b.client.rpc('mark_all_read')
    expect(error).toBeNull()

    const { data: after } = await b.client.rpc('get_unread_notification_count')
    expect(after).toBe(0)

    // Bulk clear deletes stored rows, so the center is empty too.
    const { data: listAfter } = await b.client.rpc('get_my_notifications')
    expect(listAfter ?? []).toHaveLength(0)

    const { data: stored } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', b.id)
    expect(stored ?? []).toHaveLength(0)
  })

  it('marking one notification read keeps it as read history', async () => {
    const a = await member('n-single-a')
    const b = await member('n-single-b')
    await admin.from('profiles').update({ display_name: 'Sam Single' }).eq('id', b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'Hi @Sam Single' })

    const { data: before } = await b.client.rpc('get_my_notifications')
    const mention = ((before ?? []) as MyNotificationRow[]).find((n) => n.type === 'mention')
    expect(mention).toBeDefined()

    const { error } = await b.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', mention!.id)
    expect(error).toBeNull()

    const { data: after } = await b.client.rpc('get_my_notifications')
    const kept = ((after ?? []) as MyNotificationRow[]).find((n) => n.id === mention!.id)
    expect(kept).toBeDefined()
    expect(kept!.read_at).not.toBeNull()

    const { data: count } = await b.client.rpc('get_unread_notification_count')
    const stillUnread = ((after ?? []) as MyNotificationRow[]).filter((n) => n.read_at === null)
    // The mention is read, so nothing stays unread: the mentioning message
    // counts as chat (card badge source), excluded from the header.
    expect(stillUnread).toHaveLength(0)
    expect(count).toBe(0)
  })

  it('a single read stays while mark_all_read empties the center', async () => {
    const a = await member('n-mixed-a')
    const b = await member('n-mixed-b')
    await admin.from('profiles').update({ display_name: 'Morgan Mixed' }).eq('id', b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'Hi @Morgan Mixed one' })
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'Hi @Morgan Mixed two' })

    const { data: before } = await b.client.rpc('get_my_notifications')
    const mentions = ((before ?? []) as MyNotificationRow[]).filter((n) => n.type === 'mention')
    expect(mentions).toHaveLength(2)

    const { error } = await b.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', mentions[0]!.id)
    expect(error).toBeNull()

    const { data: mixed } = await b.client.rpc('get_my_notifications')
    const rows = ((mixed ?? []) as MyNotificationRow[]).filter((n) => n.type === 'mention')
    expect(rows).toHaveLength(2)
    expect(rows.filter((n) => n.read_at === null)).toHaveLength(1)

    const { error: allErr } = await b.client.rpc('mark_all_read')
    expect(allErr).toBeNull()
    const { data: emptied } = await b.client.rpc('get_my_notifications')
    expect((emptied ?? []) as MyNotificationRow[]).toHaveLength(0)
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
