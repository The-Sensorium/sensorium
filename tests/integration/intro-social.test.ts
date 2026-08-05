import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Introduction phase + social functions: submit_intro_answers, the 72h deadline,
// raise_signal / reply_signal / set_signal_status, and send_message.

const ANSWERS = [1, 2, 3, 4, 5].map((question_id) => ({
  question_id,
  answer: `answer ${question_id}`,
}))

describe('introductions and social', () => {
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
    await onboardUser(admin, u.id, { dob: '1993-08-20' })
    return u
  }

  it('returns the five intro questions in order', async () => {
    const u = await createUser(admin, 'i-questions')
    userIds.push(u.id)
    const { data, error } = await u.client.rpc('get_intro_questions')
    expect(error).toBeNull()
    expect(data).toHaveLength(5)
    expect(data.map((q: { position: number }) => q.position)).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects intro submission from a non-member', async () => {
    const a = await member('i-nm-a')
    const outsider = await createUser(admin, 'i-nm-out')
    userIds.push(outsider.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'introductions',
    })
    clusterIds.push(clusterId)

    const { error } = await outsider.client.rpc('submit_intro_answers', {
      p_cluster_id: clusterId,
      p_answers: ANSWERS,
    })
    expect(error?.message).toContain('not_a_member')
  })

  it('does not complete the intro with fewer than five answers', async () => {
    const a = await member('i-partial')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'introductions',
    })
    clusterIds.push(clusterId)

    const { error } = await a.client.rpc('submit_intro_answers', {
      p_cluster_id: clusterId,
      p_answers: ANSWERS.slice(0, 2),
    })
    expect(error).toBeNull()

    const { data: memberRow } = await admin
      .from('cluster_members')
      .select('intro_completed_at')
      .eq('cluster_id', clusterId)
      .eq('user_id', a.id)
      .single()
    expect(memberRow?.intro_completed_at).toBeNull()

    const { data: cluster } = await admin
      .from('clusters')
      .select('status')
      .eq('id', clusterId)
      .single()
    expect(cluster?.status).toBe('introductions')
  })

  it('unlocks the cluster once every active member completes five answers', async () => {
    const members = [await member('i-full-a'), await member('i-full-b')]
    const clusterId = await createCluster(admin, {
      memberIds: members.map((m) => m.id),
      status: 'introductions',
    })
    clusterIds.push(clusterId)

    for (const m of members) {
      const { error } = await m.client.rpc('submit_intro_answers', {
        p_cluster_id: clusterId,
        p_answers: ANSWERS,
      })
      expect(error).toBeNull()
    }

    const { data: cluster } = await admin
      .from('clusters')
      .select('status, introductions_completed_at')
      .eq('id', clusterId)
      .single()
    expect(cluster?.status).toBe('active')
    expect(cluster?.introductions_completed_at).not.toBeNull()

    const { data: unlocked } = await admin
      .from('notifications')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('type', 'unlocked')
    expect(unlocked).toHaveLength(2)
  })

  it('check_intro_deadlines removes non-completers and starts a replacement', async () => {
    const completer = await member('i-dl-a')
    const slacker = await member('i-dl-b')
    const clusterId = await createCluster(admin, {
      memberIds: [completer.id, slacker.id],
      status: 'introductions',
      introductionsDeadline: new Date(Date.now() - 60_000).toISOString(),
    })
    clusterIds.push(clusterId)

    const { error: submitErr } = await completer.client.rpc('submit_intro_answers', {
      p_cluster_id: clusterId,
      p_answers: ANSWERS,
    })
    expect(submitErr).toBeNull()

    const { error } = await completer.client.rpc('check_intro_deadlines')
    expect(error).toBeNull()

    const { data: slackRow } = await admin
      .from('cluster_members')
      .select('left_at')
      .eq('cluster_id', clusterId)
      .eq('user_id', slacker.id)
      .single()
    expect(slackRow?.left_at).not.toBeNull()

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
    expect(rounds!.length).toBeGreaterThan(0)
  })

  it('raise_signal creates the signal and notifies other members', async () => {
    const [a, b] = [await member('i-sig-a'), await member('i-sig-b')]
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: signalId, error } = await a.client.rpc('raise_signal', {
      p_cluster_id: clusterId,
      p_prompt: 'Could use some help with a project',
    })
    expect(error).toBeNull()
    expect(signalId).toBeTruthy()

    const { data: notifs } = await admin
      .from('notifications')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('type', 'signal_new')
    expect(notifs).toHaveLength(1)
    expect(notifs![0].user_id).toBe(b.id)
  })

  it('rejects reply_signal for a non-member', async () => {
    const a = await member('i-rep-a')
    const outsider = await createUser(admin, 'i-rep-out')
    userIds.push(outsider.id)
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: signalId } = await a.client.rpc('raise_signal', {
      p_cluster_id: clusterId,
      p_prompt: 'need help',
    })

    const { error } = await outsider.client.rpc('reply_signal', {
      p_signal_id: signalId,
      p_content: 'I can help',
    })
    expect(error?.message).toContain('not_a_member')
  })

  it('members can reply to a signal and the author can resolve it', async () => {
    const [a, b] = [await member('i-rep-a2'), await member('i-rep-b2')]
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: signalId } = await a.client.rpc('raise_signal', {
      p_cluster_id: clusterId,
      p_prompt: 'need help with moving',
    })

    const { error: replyErr } = await b.client.rpc('reply_signal', {
      p_signal_id: signalId,
      p_content: 'I can help on Saturday',
    })
    expect(replyErr).toBeNull()

    const { data: replies } = await admin
      .from('signal_replies')
      .select('author_id, content')
      .eq('signal_id', signalId)
    expect(replies).toHaveLength(1)
    expect(replies![0].author_id).toBe(b.id)

    const { error: resolveErr } = await a.client.rpc('set_signal_status', {
      p_signal_id: signalId,
      p_status: 'resolved',
    })
    expect(resolveErr).toBeNull()

    const { data: signal } = await admin
      .from('signals')
      .select('status, resolved_by')
      .eq('id', signalId)
      .single()
    expect(signal?.status).toBe('resolved')
    expect(signal?.resolved_by).toBe(a.id)
  })

  it('send_message rejects before the cluster unlocks', async () => {
    const a = await member('i-chat-lock')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'introductions',
    })
    clusterIds.push(clusterId)

    const { error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'hello',
    })
    expect(error?.message).toContain('chat_locked')
  })

  it('send_message rejects empty messages', async () => {
    const a = await member('i-chat-empty')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { error } = await a.client.rpc('send_message', { p_cluster_id: clusterId })
    expect(error?.message).toContain('empty_message')
  })

  it('send_message enforces the database content length cap', async () => {
    const a = await member('i-chat-len')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // Exactly 2000 chars is accepted.
    const { data: okId, error: okErr } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'x'.repeat(2000),
    })
    expect(okErr).toBeNull()
    expect(okId).toBeTruthy()

    // 2001 chars violates messages_content_length.
    const { error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'x'.repeat(2001),
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/messages_content_length|check constraint/i)
  })

  it('send_message persists the message but writes no per-member rows', async () => {
    const [a, b, c] = [
      await member('i-chat-a'),
      await member('i-chat-b'),
      await member('i-chat-c'),
    ]
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id, c.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { data: messageId, error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hello everyone',
    })
    expect(error).toBeNull()
    expect(messageId).toBeTruthy()

    const { data: messages } = await admin
      .from('messages')
      .select('content, author_id')
      .eq('cluster_id', clusterId)
    expect(messages).toHaveLength(1)
    expect(messages![0].author_id).toBe(a.id)
    expect(messages![0].content).toBe('Hello everyone')

    // Chat unread is tracked via last_read_message_at, not notification rows.
    const { data: notifs } = await admin
      .from('notifications')
      .select('id')
      .eq('cluster_id', clusterId)
      .eq('type', 'message')
    expect(notifs).toHaveLength(0)

    const { data: unread } = await b.client.rpc('get_unread_notification_count')
    expect(unread).toBe(1)
  })

  it('send_message creates a mention notification', async () => {
    const [a, b] = [await member('i-ment-a'), await member('i-ment-b')]
    const { error: nameErr } = await admin
      .from('profiles')
      .update({ display_name: 'Briana Mention' })
      .eq('id', b.id)
    expect(nameErr).toBeNull()

    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hey @Briana Mention, check this',
    })
    expect(error).toBeNull()

    const { data: mentions } = await admin
      .from('notifications')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('type', 'mention')
    expect(mentions).toHaveLength(1)
    expect(mentions![0].user_id).toBe(b.id)
  })

  it('does not mention on a mid-word @', async () => {
    const [a, b] = [await member('i-ment-e'), await member('i-ment-f')]
    const { error: nameErr } = await admin
      .from('profiles')
      .update({ display_name: 'Cara Word' })
      .eq('id', b.id)
    expect(nameErr).toBeNull()

    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'email me at me@Cara Word please',
    })
    expect(error).toBeNull()

    const { data: mentions } = await admin
      .from('notifications')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('type', 'mention')
    expect(mentions).toHaveLength(0)
  })

  it('does not mention a name that continues into another word', async () => {
    const [a, b] = [await member('i-ment-g'), await member('i-ment-h')]
    const { error: nameErr } = await admin
      .from('profiles')
      .update({ display_name: 'Dan Word' })
      .eq('id', b.id)
    expect(nameErr).toBeNull()

    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const { error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'hi @Dan Wordz',
    })
    expect(error).toBeNull()

    const { data: mentions } = await admin
      .from('notifications')
      .select('user_id')
      .eq('cluster_id', clusterId)
      .eq('type', 'mention')
    expect(mentions).toHaveLength(0)
  })
})
