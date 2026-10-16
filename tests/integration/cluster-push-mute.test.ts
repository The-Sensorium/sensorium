import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/lib/database.types'
import {
  adminClient,
  cleanup,
  createCluster,
  createUser,
  onboardUser,
  type TestUser,
} from './helpers'

type UnreadChatCount =
  Database['public']['Functions']['get_unread_chat_counts']['Returns'][number]

// Per-cluster push mute (0205): push_muted_until suppresses push_outbox rows
// from both fan-outs (plain chat and stored notification rows) while the
// notification center and unread chat counts keep working. Expiry is
// automatic; clearing the timestamp unmutes.

async function outboxFor(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await admin
    .from('push_outbox')
    .select('id,type,status')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as { id: string; type: string; status: string }[]
}

describe('cluster push mute', () => {
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

  async function withToken(userId: string) {
    const { error } = await admin.from('push_tokens').insert({
      user_id: userId,
      expo_push_token: `ExponentPushToken[mute-${userId.slice(0, 8)}]`,
    })
    expect(error).toBeNull()
  }

  async function pair(): Promise<{ a: TestUser; b: TestUser; clusterId: string }> {
    const a = await member('pm-a')
    const b = await member('pm-b')
    await admin.from('profiles').update({ display_name: 'Muted Dana' }).eq('id', b.id)
    await withToken(b.id)
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    return { a, b, clusterId }
  }

  async function muteUntil(b: TestUser, clusterId: string, value: string | null) {
    const { error } = await b.client.from('notification_prefs').upsert(
      { user_id: b.id, cluster_id: clusterId, push_muted_until: value },
      { onConflict: 'user_id,cluster_id' },
    )
    expect(error).toBeNull()
  }

  it('suppresses plain-chat push while keeping unread counts', async () => {
    const { a, b, clusterId } = await pair()
    await muteUntil(b, clusterId, new Date(Date.now() + 3600_000).toISOString())

    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'hello muted' })

    expect(await outboxFor(admin, b.id)).toHaveLength(0)

    const { data: counts, error: countsError } = await b.client.rpc('get_unread_chat_counts')
    expect(countsError).toBeNull()
    const row = ((counts ?? []) as UnreadChatCount[]).find((r) => r.cluster_id === clusterId)
    expect(row?.unread_count).toBeGreaterThan(0)
  })

  it('keeps the notification center row while suppressing its push', async () => {
    const { a, b, clusterId } = await pair()
    await muteUntil(b, clusterId, new Date(Date.now() + 3600_000).toISOString())

    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'Hello @Muted Dana',
    })

    const { data: notifs, error: notifError } = await admin
      .from('notifications')
      .select('id,type')
      .eq('user_id', b.id)
      .eq('type', 'mention')
    expect(notifError).toBeNull()
    expect(notifs).toHaveLength(1)
    expect(await outboxFor(admin, b.id)).toHaveLength(0)
  })

  it('restores push after expiry and after unmuting', async () => {
    const { a, b, clusterId } = await pair()

    async function clearOutbox() {
      const { error } = await admin.from('push_outbox').delete().eq('user_id', b.id)
      expect(error).toBeNull()
    }

    await muteUntil(b, clusterId, new Date(Date.now() - 1000).toISOString())
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'after expiry' })
    expect((await outboxFor(admin, b.id)).filter((r) => r.type === 'message')).toHaveLength(1)
    await clearOutbox()

    await muteUntil(b, clusterId, 'infinity')
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'indefinite' })
    expect((await outboxFor(admin, b.id)).filter((r) => r.type === 'message')).toHaveLength(0)
    await clearOutbox()

    await muteUntil(b, clusterId, null)
    await a.client.rpc('send_message', { p_cluster_id: clusterId, p_content: 'unmuted' })
    expect((await outboxFor(admin, b.id)).filter((r) => r.type === 'message')).toHaveLength(1)
  })
})
