import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  cleanup,
  createCluster,
  createUser,
  onboardUser,
  type TestUser,
} from './helpers'

// Muted-author suppression (0163): once b mutes a, new member-activity
// traffic from a (mention incl. @everyone, reaction, post_comment,
// post_like, plain-chat push) never reaches b, while history stays and
// unmuted members are unaffected.

describe('muted-author notification suppression', () => {
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

  async function mute(muter: TestUser, muted: TestUser) {
    const { error } = await muter.client.from('user_mutes').insert({
      user_id: muter.id,
      muted_user_id: muted.id,
    })
    expect(error).toBeNull()
  }

  async function stored(userId: string, type: string) {
    const { data } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', type)
    return data ?? []
  }

  it('suppresses direct mentions and broadcasts for the muter only', async () => {
    const a = await member('mute-men-a')
    const b = await member('mute-men-b')
    const c = await member('mute-men-c')
    await admin.from('profiles').update({ display_name: 'Muted Beth' }).eq('id', b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id, c.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await mute(b, a)

    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hey @Muted Beth',
    })
    expect(await stored(b.id, 'mention')).toHaveLength(0)

    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hi @everyone',
    })
    expect(await stored(b.id, 'mention')).toHaveLength(0)

    // Unmuted third member still gets the broadcast.
    const cMentions = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', c.id)
      .eq('cluster_id', clusterId)
      .eq('type', 'mention')
    expect((cMentions.data ?? [])).toHaveLength(1)
  })

  it('suppresses reactions from the muted author', async () => {
    const a = await member('mute-re-a')
    const b = await member('mute-re-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: messageId } = await b.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'react to me',
    })

    await mute(b, a)

    const { error } = await a.client.from('message_reactions').insert({
      message_id: messageId,
      user_id: a.id,
      emoji: '❤️',
    })
    expect(error).toBeNull()
    expect(await stored(b.id, 'reaction')).toHaveLength(0)
  })

  it('suppresses post comments, replies, and likes from the muted author', async () => {
    const a = await member('mute-po-a')
    const b = await member('mute-po-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: postId } = await b.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: 'my post',
      p_image_url: null,
      p_gif_url: null,
    })

    await mute(b, a)

    await a.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'a comment',
      p_image_url: null,
      p_gif_url: null,
    })
    expect(await stored(b.id, 'post_comment')).toHaveLength(0)

    // Reply path: b comments first (own row, then a replies to it).
    await admin.from('notifications').delete().eq('user_id', b.id)
    const { data: bComment } = await b.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'b top comment',
      p_image_url: null,
      p_gif_url: null,
    })
    await a.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'a reply',
      p_image_url: null,
      p_gif_url: null,
      p_parent_comment_id: bComment,
    })
    expect(await stored(b.id, 'post_comment')).toHaveLength(0)

    // b removes the self-like so a's like is the only new one.
    await b.client.rpc('toggle_post_like', { p_post_id: postId })
    await a.client.rpc('toggle_post_like', { p_post_id: postId })
    expect(await stored(b.id, 'post_like')).toHaveLength(0)
  })

  it('suppresses plain-chat push for the muter while others still get theirs', async () => {
    const a = await member('mute-pu-a')
    const b = await member('mute-pu-b')
    const c = await member('mute-pu-c')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id, c.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    for (const u of [b, c]) {
      const { error } = await admin.from('push_tokens').insert({
        user_id: u.id,
        expo_push_token: `ExponentPushToken[mute-${u.id.slice(0, 8)}]`,
      })
      expect(error).toBeNull()
    }

    await mute(b, a)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'plain hello' })

    const { data: rows } = await admin.from('push_outbox').select('user_id')
    expect((rows ?? []).filter((r) => r.user_id === b.id)).toHaveLength(0)
    expect((rows ?? []).filter((r) => r.user_id === c.id)).toHaveLength(1)
  })

  it('keeps history visible, restores delivery on unmute, and stays silent with prefs off', async () => {
    const a = await member('mute-hi-a')
    const b = await member('mute-hi-b')
    await admin.from('profiles').update({ display_name: 'Hist Beth' }).eq('id', b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // Seed one mention before the mute; it stays after.
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hey @Hist Beth one',
    })
    expect(await stored(b.id, 'mention')).toHaveLength(1)

    await mute(b, a)

    const { data: list } = await b.client.rpc('get_my_notifications')
    expect(((list ?? []) as { type?: string }[]).filter((n) => n.type === 'mention')).toHaveLength(1)

    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hey @Hist Beth two',
    })
    expect(await stored(b.id, 'mention')).toHaveLength(1)

    // Prefs-off plus muted still yields nothing new.
    await admin.from('notification_prefs').insert({
      user_id: b.id,
      cluster_id: clusterId,
      mentions: false,
    })
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hey @Hist Beth three',
    })
    expect(await stored(b.id, 'mention')).toHaveLength(1)

    // Unmute restores future delivery.
    const { error: unmuteErr } = await b.client
      .from('user_mutes')
      .delete()
      .eq('user_id', b.id)
      .eq('muted_user_id', a.id)
    expect(unmuteErr).toBeNull()
    await admin.from('notification_prefs').delete().eq('user_id', b.id).eq('cluster_id', clusterId)
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hey @Hist Beth four',
    })
    expect(await stored(b.id, 'mention')).toHaveLength(2)
  })

  it('does not suppress governance notifications from a muted member', async () => {
    const a = await member('mute-go-a')
    const b = await member('mute-go-b')
    const c = await member('mute-go-c')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id, c.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await mute(b, a)

    // a starts a replace vote targeting c; b still gets the vote_started row.
    const { data: voteId, error } = await a.client.rpc('start_replace_vote', {
      p_cluster_id: clusterId,
      p_target_member_id: c.id,
    })
    expect(error).toBeNull()
    expect(voteId).toBeTruthy()

    const { data } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', b.id)
      .eq('cluster_id', clusterId)
      .eq('type', 'vote_started')
    expect((data ?? [])).toHaveLength(1)
  })
})
