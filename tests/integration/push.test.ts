import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
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
})
