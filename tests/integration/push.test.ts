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

// Push outbox: the AFTER INSERT trigger on notifications fans every type out
// through the Settings prefs gate, the claim/mark lifecycle drives the
// send-push Edge Function, failures abandon, and the recovery sweep re-queues
// stuck rows. No real push is ever sent; we assert on push_outbox rows.

type OutboxRow = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  channel: string
  status: string
  attempts: number
  last_error: string | null
  sent_at: string | null
  expo_push_token: string | null
}

async function outbox(admin: ReturnType<typeof adminClient>): Promise<OutboxRow[]> {
  const { data, error } = await admin.from('push_outbox').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as OutboxRow[]
}

describe('push outbox fan-out', () => {
  const admin = adminClient()
  const userIds: string[] = []
  const clusterIds: string[] = []

  beforeEach(() => {
    userIds.length = 0
    clusterIds.length = 0
  })

  afterEach(async () => {
    await cleanup(admin, clusterIds, userIds)
    // Burst tests toggle this global; restore the fresh-DB default so no
    // later test inherits it through ordering.
    await admin.from('push_settings').update({ bundling_enabled: false }).eq('id', true)
  })

  async function member(prefix: string): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await onboardUser(admin, u.id, { dob: '1995-06-01' })
    return u
  }

  async function withToken(userId: string, suffix = '') {
    const { error } = await admin.from('push_tokens').insert({
      user_id: userId,
      expo_push_token: `ExponentPushToken[${userId.slice(0, 8)}${suffix}]`,
    })
    expect(error).toBeNull()
  }

  async function setBundling(enabled: boolean) {
    const { error } = await admin.from('push_settings').update({ bundling_enabled: enabled }).eq('id', true)
    expect(error).toBeNull()
  }

  async function mentionCluster(a: TestUser, b: TestUser): Promise<string> {
    await admin.from('profiles').update({ display_name: 'Dana Push' }).eq('id', b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hello @Dana Push',
    })
    return clusterId
  }

  it('fans a mention out with channel and v1 deep-link payload', async () => {
    const a = await member('push-a')
    const b = await member('push-b')
    await withToken(b.id)
    const clusterId = await mentionCluster(a, b)

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.type).toBe('mention')
    expect(rows[0]!.channel).toBe('mentions')
    expect(rows[0]!.status).toBe('queued')
    expect(rows[0]!.data).toMatchObject({ v: 1, kind: 'mention', clusterId })
    const { data: msgs } = await admin.from('messages').select('id').eq('cluster_id', clusterId)
    expect(rows[0]!.data).toMatchObject({ messageId: msgs![0]!.id })
  })

  it('fans plain chat out as message push without a notification row', async () => {
    const a = await member('push-plain-a')
    const b = await member('push-plain-b')
    await admin.from('profiles').update({ display_name: 'Plain Sender' }).eq('id', a.id)
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'hello plain' })

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ type: 'message', channel: 'messages', status: 'queued' })
    expect(rows[0]!.title).toBe('Test Cluster')
    expect(rows[0]!.body).toBe('Plain Sender: hello plain')
    expect(rows[0]!.data).toMatchObject({ v: 1, kind: 'message', clusterId })
    const { data: msgs } = await admin.from('messages').select('id').eq('cluster_id', clusterId)
    expect(rows[0]!.data).toMatchObject({ messageId: msgs![0]!.id })

    // Plain chat stays out of the notifications table (ephemeral inbox entry only).
    const { data: stored } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', b.id)
      .eq('cluster_id', clusterId)
    expect(stored ?? []).toHaveLength(0)

    // The author gets nothing.
    expect((await outbox(admin)).filter((r) => r.user_id === a.id)).toHaveLength(0)
  })

  it('fans a post comment out with post and comment deep-link ids', async () => {
    const a = await member('push-pc-a')
    const b = await member('push-pc-b')
    await withToken(a.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const { data: postId, error: postErr } = await a.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: 'post body',
      p_image_url: null,
      p_gif_url: null,
    })
    expect(postErr).toBeNull()
    const { data: commentId, error: commentErr } = await b.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'nice post',
      p_image_url: null,
      p_gif_url: null,
      p_parent_comment_id: null,
    })
    expect(commentErr).toBeNull()

    const rows = (await outbox(admin)).filter((r) => r.user_id === a.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.type).toBe('post_comment')
    expect(rows[0]!.data).toMatchObject({ v: 1, postId, commentId, clusterId })
  })

  it('names the cluster in plain chat push titles', async () => {
    await setBundling(true)
    const a = await member('push-cn-a')
    const b = await member('push-cn-b')
    await admin.from('profiles').update({ display_name: 'Name Sender' }).eq('id', a.id)
    await withToken(b.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
      name: 'Aurora Check',
    })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'which cluster is this' })

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('Aurora Check')
    expect(rows[0]!.body).toBe('Name Sender: which cluster is this')
  })

  it('merges rapid follow-ups into one queued burst row', async () => {
    await setBundling(true)
    const a = await member('push-burst-a')
    const b = await member('push-burst-b')
    await admin.from('profiles').update({ display_name: 'Burst Sender' }).eq('id', a.id)
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'first burst' })
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'second burst' })

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ type: 'message', channel: 'messages', status: 'queued' })
    expect(rows[0]!.title).toBe('Test Cluster · 2 new messages')
    expect(rows[0]!.body).toBe('Burst Sender: first burst\nBurst Sender: second burst')
    expect(rows[0]!.data).toMatchObject({
      count: 2,
      clusterId,
      lines: ['Burst Sender: first burst', 'Burst Sender: second burst'],
    })
  })

  it('caps accumulated lines at the last 5 with an exact count', async () => {
    await setBundling(true)
    const a = await member('push-cap-a')
    const b = await member('push-cap-b')
    await admin.from('profiles').update({ display_name: 'Cap Sender' }).eq('id', a.id)
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    for (let i = 1; i <= 6; i++) {
      await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: `line ${i}` })
    }

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('Test Cluster · 6 new messages')
    expect(rows[0]!.body).toBe(
      [
        'Cap Sender: line 2',
        'Cap Sender: line 3',
        'Cap Sender: line 4',
        'Cap Sender: line 5',
        'Cap Sender: line 6',
      ].join('\n'),
    )
    expect(rows[0]!.data).toMatchObject({ count: 6 })
    expect((rows[0]!.data['lines'] as unknown[])).toHaveLength(5)
  })

  it('routes follow-ups to messages-quiet after a sent push inside the window', async () => {
    await setBundling(true)
    const a = await member('push-quiet-a')
    const b = await member('push-quiet-b')
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'burst start' })

    const first = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(first).toHaveLength(1)
    await admin.rpc('mark_push_notification', { p_id: first[0]!.id, p_status: 'sent' })

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'burst follow-up' })
    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ channel: 'messages', status: 'sent' })
    expect(rows[1]).toMatchObject({ type: 'message', channel: 'messages-quiet', status: 'queued' })
    expect(rows[1]!.title).toBe('Test Cluster · 2 new messages')
    expect(rows[1]!.body).toBe('Integration User: burst start\nIntegration User: burst follow-up')
    expect(rows[1]!.data).toMatchObject({
      count: 2,
      lines: ['Integration User: burst start', 'Integration User: burst follow-up'],
    })
  })

  it('goes loud again after the recipient reads the cluster', async () => {
    await setBundling(true)
    const a = await member('push-reread-a')
    const b = await member('push-reread-b')
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'before read' })

    const first = (await outbox(admin)).filter((r) => r.user_id === b.id)
    await admin.rpc('mark_push_notification', { p_id: first[0]!.id, p_status: 'sent' })
    expect((await b.client.rpc('mark_cluster_read', { p_cluster_id: clusterId })).error).toBeNull()

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'after read' })
    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ type: 'message', channel: 'messages', status: 'queued' })
  })

  it('a mention inside a burst still alerts loudly', async () => {
    await setBundling(true)
    const a = await member('push-burstmen-a')
    const b = await member('push-burstmen-b')
    await admin.from('profiles').update({ display_name: 'Burstmen Target' }).eq('id', b.id)
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'plain burst start' })
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hello @Burstmen Target',
    })

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    const mention = rows.filter((r) => r.type === 'mention')
    expect(mention).toHaveLength(1)
    expect(mention[0]).toMatchObject({ channel: 'mentions', status: 'queued' })
  })

  it('merges bursts across all tokens of a multi-token user', async () => {
    await setBundling(true)
    const a = await member('push-burstmt-a')
    const b = await member('push-burstmt-b')
    await withToken(b.id, '-1')
    await withToken(b.id, '-2')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'burst one' })
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'burst two' })

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row).toMatchObject({ type: 'message', channel: 'messages', status: 'queued' })
      expect(row.title).toBe('Test Cluster · 2 new messages')
      expect(row.body).toBe('Integration User: burst one\nIntegration User: burst two')
      expect(row.data).toMatchObject({ count: 2 })
    }
  })

  it('stays loud while bundling is disabled', async () => {
    await setBundling(false)
    try {
      const a = await member('push-nobundle-a')
      const b = await member('push-nobundle-b')
      await withToken(b.id)
      const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
      clusterIds.push(clusterId)
      await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'first' })

      const first = (await outbox(admin)).filter((r) => r.user_id === b.id)
      expect(first).toHaveLength(1)
      await admin.rpc('mark_push_notification', { p_id: first[0]!.id, p_status: 'sent' })

      await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'second' })
      const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
      expect(rows).toHaveLength(2)
      expect(rows[1]).toMatchObject({ type: 'message', channel: 'messages', status: 'queued' })
    } finally {
      await setBundling(true)
    }
  })

  it('keeps one row per cluster when two clusters burst at once', async () => {
    await setBundling(true)
    const a = await member('push-twoc-a')
    const b = await member('push-twoc-b')
    await withToken(b.id)
    const c1 = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    const c2 = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(c1, c2)
    await a.client.rpc('send_message', { p_cluster_id: c1, p_content: 'cluster one' })
    await a.client.rpc('send_message', { p_cluster_id: c2, p_content: 'cluster two' })

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.data['clusterId']).sort()).toEqual([c1, c2].sort())
  })

  it('goes loud again once the coalesce window expires', async () => {
    await setBundling(true)
    const a = await member('push-expire-a')
    const b = await member('push-expire-b')
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'window start' })

    const first = (await outbox(admin)).filter((r) => r.user_id === b.id)
    await admin.rpc('mark_push_notification', { p_id: first[0]!.id, p_status: 'sent' })
    // Sent 5 minutes ago (outside the 120s window) but after a 10-minute-old
    // read watermark, so only the window - not the watermark - re-arms loud.
    const sentAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const readAt = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await admin.from('push_outbox').update({ sent_at: sentAt }).eq('id', first[0]!.id)
    await admin
      .from('cluster_members')
      .update({ last_read_message_at: readAt })
      .eq('cluster_id', clusterId)
      .eq('user_id', b.id)

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'after window' })
    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ type: 'message', channel: 'messages', status: 'queued' })
    // A new burst starts with exactly its own line: the old burst's text
    // must not resurrect just because it is recent.
    expect(rows[1]!.title).toBe('Test Cluster')
    expect(rows[1]!.body).toBe('Integration User: after window')
    expect(rows[1]!.body).not.toContain('window start')
  })

  it('does not double-push mentioned members with a message push', async () => {
    const a = await member('push-nodbl-a')
    const b = await member('push-nodbl-b')
    await admin.from('profiles').update({ display_name: 'Nodbl Target' }).eq('id', b.id)
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hello @Nodbl Target',
    })

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.type).toBe('mention')
  })

  it('fans @everyone out as mention pushes without message pushes', async () => {
    const a = await member('push-ev-a')
    const b = await member('push-ev-b')
    const c = await member('push-ev-c')
    await withToken(b.id)
    await withToken(c.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id, c.id], status: 'active' })
    clusterIds.push(clusterId)
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hi @everyone',
    })

    for (const recipient of [b, c]) {
      const rows = (await outbox(admin)).filter((r) => r.user_id === recipient.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.type).toBe('mention')
      expect(rows[0]!.channel).toBe('mentions')
      expect(rows[0]!.title).toContain('mentioned everyone')
    }
    expect((await outbox(admin)).filter((r) => r.user_id === a.id)).toHaveLength(0)
  })

  it('skips plain chat push when messages are disabled in prefs', async () => {
    const a = await member('push-plainpref-a')
    const b = await member('push-plainpref-b')
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await admin.from('notification_prefs').insert({
      user_id: b.id,
      cluster_id: clusterId,
      messages: false,
    })
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'you will not see this' })

    expect((await outbox(admin)).filter((r) => r.user_id === b.id)).toHaveLength(0)
  })

  it('fans one row per registered token with independent delivery state', async () => {
    const a = await member('push-mt-a')
    const b = await member('push-mt-b')
    await withToken(b.id, '-1')
    await withToken(b.id, '-2')
    await mentionCluster(a, b)

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(2)

    const { data: claimed } = await admin.rpc('claim_push_notifications', { p_limit: 20 })
    const bClaimed = claimed!.filter((r: { id: string }) => rows.some((o) => o.id === r.id))
    expect(bClaimed).toHaveLength(2)
  })

  it('a dead token is removed without re-sending to the healthy token', async () => {
    const a = await member('push-mt2-a')
    const b = await member('push-mt2-b')
    await withToken(b.id, '-good')
    await withToken(b.id, '-dead')
    await mentionCluster(a, b)

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    const good = rows.find((r) => r.expo_push_token?.endsWith('-good]'))
    const dead = rows.find((r) => r.expo_push_token?.endsWith('-dead]'))
    expect(good).toBeDefined()
    expect(dead).toBeDefined()

    // Dead token's device unregisters / goes stale: the worker deletes the
    // token and abandons its row, while the healthy row stays independent.
    await admin.from('push_tokens').delete().eq('expo_push_token', dead!.expo_push_token)
    for (let i = 0; i < 5; i++) {
      await admin.rpc('mark_push_notification', { p_id: dead!.id, p_status: 'failed', p_error: 'DeviceNotRegistered' })
    }
    const afterDead = (await outbox(admin)).find((r) => r.id === dead!.id)!
    expect(afterDead.status).toBe('abandoned')

    const { data: claim } = await admin.rpc('claim_push_notifications', { p_limit: 20 })
    const reclaimed = claim!.filter((r: { id: string }) => r.id === good!.id)
    expect(reclaimed).toHaveLength(1)
    await admin.rpc('mark_push_notification', { p_id: good!.id, p_status: 'sent' })
    expect((await outbox(admin)).find((r) => r.id === good!.id)!.status).toBe('sent')
  })

  it('skips fan-out when the type is disabled in Settings prefs', async () => {
    const a = await member('push-c')
    const b = await member('push-d')
    await withToken(b.id)
    const clusterId = await mentionCluster(a, b)

    await admin.from('notification_prefs').insert({
      user_id: b.id,
      cluster_id: clusterId,
      mentions: false,
    })
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Again @Dana Push',
    })

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(1)
  })

  it('skips fan-out without a registered token', async () => {
    const a = await member('push-e')
    const b = await member('push-f')
    await mentionCluster(a, b)

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(0)
  })

  it('skips fan-out for restricted accounts', async () => {
    const a = await member('push-g')
    const b = await member('push-h')
    await withToken(b.id)
    const { error: restrictErr } = await admin.from('account_restrictions').insert({
      user_id: b.id,
      status: 'banned',
      reason: 'test ban',
    })
    expect(restrictErr).toBeNull()
    await mentionCluster(a, b)

    const rows = (await outbox(admin)).filter((r) => r.user_id === b.id)
    expect(rows).toHaveLength(0)
  })

  it('claim joins tokens, mark completes, failures abandon, recovery re-queues', async () => {
    const u = await member('push-i')
    await withToken(u.id)
    const { error: notifyErr } = await admin.from('notifications').insert({
      user_id: u.id,
      type: 'cluster_formed',
      title: 'Cluster formed',
      body: 'Say hi',
    })
    expect(notifyErr).toBeNull()

    const { data: claimed, error: claimErr } = await admin.rpc('claim_push_notifications', { p_limit: 20 })
    expect(claimErr).toBeNull()
    expect(claimed).toHaveLength(1)
    expect(claimed![0].expo_push_token).toContain('ExponentPushToken')
    expect(claimed![0].channel).toBe('messages')

    const id = (claimed![0] as { id: string }).id
    const { error: markErr } = await admin.rpc('mark_push_notification', { p_id: id, p_status: 'sent' })
    expect(markErr).toBeNull()
    const sent = await outbox(admin)
    expect(sent[0]!.status).toBe('sent')
    expect(sent[0]!.attempts).toBe(1)
    expect(sent[0]!.sent_at).not.toBeNull()

    const { error: notifyErr2 } = await admin.from('notifications').insert({
      user_id: u.id,
      type: 'queue_update',
      title: 'Queue update',
    })
    expect(notifyErr2).toBeNull()
    const pending = (await outbox(admin)).filter((r) => r.status === 'queued')
    expect(pending).toHaveLength(1)
    const doomed = pending[0]!.id
    for (let i = 0; i < 5; i++) {
      const { error } = await admin.rpc('mark_push_notification', {
        p_id: doomed,
        p_status: 'failed',
        p_error: 'expo 500',
      })
      expect(error).toBeNull()
    }
    const dead = (await outbox(admin)).find((r) => r.id === doomed)!
    expect(dead.status).toBe('abandoned')
    expect(dead.attempts).toBe(5)

    const { error: notifyErr3 } = await admin.from('notifications').insert({
      user_id: u.id,
      type: 'unlocked',
      title: 'Unlocked',
    })
    expect(notifyErr3).toBeNull()
    const stuck = (await outbox(admin)).filter((r) => r.status === 'queued')
    const stuckId = stuck[0]!.id
    await admin.rpc('claim_push_notifications', { p_limit: 20 })
    await admin.from('push_outbox').update({ updated_at: new Date(Date.now() - 10 * 60_1000).toISOString() }).eq('id', stuckId)
    const { error: recoverErr } = await admin.rpc('recover_stuck_push_sending')
    expect(recoverErr).toBeNull()
    const revived = (await outbox(admin)).find((r) => r.id === stuckId)!
    expect(revived.status).toBe('queued')
  })

  it('re-claims a failed row with attempts below the limit', async () => {
    const u = await member('push-retry')
    await withToken(u.id)
    const { error: notifyErr } = await admin.from('notifications').insert({
      user_id: u.id,
      type: 'queue_update',
      title: 'Retry me',
    })
    expect(notifyErr).toBeNull()

    const { data: first } = await admin.rpc('claim_push_notifications', { p_limit: 20 })
    const id = (first![0] as { id: string }).id
    const { error: failErr } = await admin.rpc('mark_push_notification', {
      p_id: id,
      p_status: 'failed',
      p_error: 'transient',
    })
    expect(failErr).toBeNull()

    const after = (await outbox(admin)).find((r) => r.id === id)!
    expect(after.status).toBe('failed')
    expect(after.attempts).toBe(1)

    const { data: second } = await admin.rpc('claim_push_notifications', { p_limit: 20 })
    expect(second!.some((r: { id: string }) => r.id === id)).toBe(true)
  })

  it('wake and pump are safe no-ops while push_settings is disabled', async () => {
    const u = await member('push-wake')
    await withToken(u.id)
    const { error: wakeErr } = await admin.rpc('wake_push_worker')
    expect(wakeErr).toBeNull()
    const { error: pumpErr } = await admin.rpc('pump_push_notifications')
    expect(pumpErr).toBeNull()
    const { data: rows } = await admin.from('push_outbox').select('id')
    expect(rows ?? []).toHaveLength(0)
  })

  it('fan-out with push_settings enabled queues rows without erroring', async () => {
    const u = await member('push-wake2')
    await withToken(u.id)
    const { error: setErr } = await admin.from('push_settings').update({
      edge_url: 'http://127.0.0.1:9/functions/v1/send-push', // nothing listening; pg_net fires async and fails silently
      secret: 'test-secret',
      enabled: true,
    }).eq('id', true)
    expect(setErr).toBeNull()

    const { error: notifyErr } = await admin.from('notifications').insert({
      user_id: u.id,
      type: 'mention',
      title: 'Wake test',
    })
    expect(notifyErr).toBeNull()

    const rows = (await outbox(admin)).filter((r) => r.user_id === u.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('queued')
  })

  it('denies client access to the outbox', async () => {
    const u = await member('push-j')
    const { data } = await u.client.from('push_outbox').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('register steals a shared device token so one device gets one push', async () => {
    const a = await member('push-steal-a')
    const b = await member('push-steal-b')
    const token = `ExponentPushToken[steal-${a.id.slice(0, 8)}]`

    const { error: regA } = await a.client.rpc('register_push_token', { p_expo_push_token: token })
    expect(regA).toBeNull()
    const { error: regB } = await b.client.rpc('register_push_token', { p_expo_push_token: token })
    expect(regB).toBeNull()

    const { data: rows, error } = await admin.from('push_tokens').select('user_id').eq('expo_push_token', token)
    expect(error).toBeNull()
    expect(rows!.map((r) => r.user_id)).toEqual([b.id])

    const { error: unreg } = await b.client.rpc('unregister_push_token', { p_expo_push_token: token })
    expect(unreg).toBeNull()
    const { data: after } = await admin.from('push_tokens').select('user_id').eq('expo_push_token', token)
    expect(after ?? []).toHaveLength(0)
  })

  it('register is rejected for inactive accounts and without auth', async () => {
    const u = await member('push-inactive')
    const { error: restrictErr } = await admin.from('account_restrictions').insert({
      user_id: u.id,
      status: 'banned',
      reason: 'test ban',
    })
    expect(restrictErr).toBeNull()
    const { error: regErr } = await u.client.rpc('register_push_token', {
      p_expo_push_token: `ExponentPushToken[banned-${u.id.slice(0, 8)}]`,
    })
    expect(regErr).not.toBeNull()

    const { error: anonErr } = await anonClient().rpc('register_push_token', {
      p_expo_push_token: 'ExponentPushToken[anon]',
    })
    expect(anonErr).not.toBeNull()
    const { error: anonUnreg } = await anonClient().rpc('unregister_push_token', {
      p_expo_push_token: 'ExponentPushToken[anon]',
    })
    expect(anonUnreg).not.toBeNull()
  })

  it('unregister only removes the caller token, even when banned', async () => {
    const a = await member('push-unreg-a')
    const b = await member('push-unreg-b')
    const tokenA = `ExponentPushToken[unreg-${a.id.slice(0, 8)}]`

    expect((await a.client.rpc('register_push_token', { p_expo_push_token: tokenA })).error).toBeNull()
    expect((await b.client.rpc('unregister_push_token', { p_expo_push_token: tokenA })).error).toBeNull()
    const { data: survived } = await admin.from('push_tokens').select('user_id').eq('expo_push_token', tokenA)
    expect(survived!.map((r) => r.user_id)).toEqual([a.id])

    const { error: restrictErr } = await admin.from('account_restrictions').insert({
      user_id: a.id,
      status: 'banned',
      reason: 'test ban',
    })
    expect(restrictErr).toBeNull()
    expect((await a.client.rpc('unregister_push_token', { p_expo_push_token: tokenA })).error).toBeNull()
    const { data: gone } = await admin.from('push_tokens').select('user_id').eq('expo_push_token', tokenA)
    expect(gone ?? []).toHaveLength(0)
  })

  it('legacy direct inserts also steal the token via trigger', async () => {
    const a = await member('push-trig-a')
    const b = await member('push-trig-b')
    const token = `ExponentPushToken[trig-${a.id.slice(0, 8)}]`

    expect((await admin.from('push_tokens').insert({ user_id: a.id, expo_push_token: token })).error).toBeNull()
    expect((await admin.from('push_tokens').insert({ user_id: b.id, expo_push_token: token })).error).toBeNull()

    const { data: rows, error } = await admin.from('push_tokens').select('user_id').eq('expo_push_token', token)
    expect(error).toBeNull()
    expect(rows!.map((r) => r.user_id)).toEqual([b.id])
  })
})
