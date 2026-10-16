import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Voice notes (migration 0200): the voice-notes bucket is private and scoped
// to active members like chat-images, send_message accepts audio params with
// a 1..120s duration and allowlisted MIME, and plain-chat pushes preview as
// "Voice note (M:SS)".

const TINY_M4A = Buffer.from(
  'AAAAIGZ0eXBNNEEgAAACAGlzb21pc28yAAAAEWZyZWUAAAANbWRhdAAAAAAAAAAAAAAA=',
  'base64',
)

describe('voice notes', () => {
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
    await onboardUser(admin, u.id, { dob: '1997-06-18' })
    return u
  }

  async function pair(): Promise<{ a: TestUser; b: TestUser; clusterId: string }> {
    const a = await member('v-a')
    const b = await member('v-b')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    return { a, b, clusterId }
  }

  it('voice-notes bucket is private: anon cannot list or sign', async () => {
    const anon = anonClient()
    const { data, error } = await anon.storage.from('voice-notes').list()
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    const { error: signErr } = await anon.storage
      .from('voice-notes')
      .createSignedUrl('00000000-0000-0000-0000-000000000000/nope.m4a', 60)
    expect(signErr).not.toBeNull()
  })

  it('a member can upload and sign a voice note; a non-member cannot', async () => {
    const { a, b, clusterId } = await pair()
    const outsider = await member('v-out')
    const path = `${clusterId}/${crypto.randomUUID()}.m4a`

    const { error: upErr } = await a.client.storage
      .from('voice-notes')
      .upload(path, TINY_M4A, { contentType: 'audio/m4a' })
    expect(upErr).toBeNull()

    const { data: signed, error } = await b.client.storage.from('voice-notes').createSignedUrl(path, 60)
    expect(error).toBeNull()
    expect(signed?.signedUrl).toContain(clusterId)

    const { error: outsiderErr } = await outsider.client.storage
      .from('voice-notes')
      .createSignedUrl(path, 60)
    expect(outsiderErr).not.toBeNull()
  })

  it('send_message accepts a voice note and rejects bad audio params', async () => {
    const { a, clusterId } = await pair()
    const path = `${clusterId}/${crypto.randomUUID()}.m4a`
    const { error: upErr } = await a.client.storage
      .from('voice-notes')
      .upload(path, TINY_M4A, { contentType: 'audio/m4a' })
    expect(upErr).toBeNull()

    const { data: id, error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_audio_url: path,
      p_audio_duration_sec: 42,
      p_audio_waveform: [0.1, 0.5, 0.9],
      p_audio_mime: 'audio/m4a',
    })
    expect(error).toBeNull()
    expect(typeof id).toBe('string')

    const { error: badDuration } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_audio_url: path,
      p_audio_duration_sec: 121,
      p_audio_mime: 'audio/m4a',
    })
    expect(badDuration).not.toBeNull()

    const { error: badMime } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_audio_url: path,
      p_audio_duration_sec: 10,
      p_audio_mime: 'audio/wav',
    })
    expect(badMime).not.toBeNull()

    const { error: both } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_image_url: 'chat-images/demo.png',
      p_audio_url: path,
      p_audio_duration_sec: 10,
      p_audio_mime: 'audio/m4a',
    })
    expect(both).not.toBeNull()
  })

  it('rejects captions and foreign-cluster paths on voice notes', async () => {
    const { a, clusterId } = await pair()
    const path = `${clusterId}/${crypto.randomUUID()}.m4a`
    await a.client.storage.from('voice-notes').upload(path, TINY_M4A, { contentType: 'audio/m4a' })

    const { error: captionErr } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'a caption',
      p_audio_url: path,
      p_audio_duration_sec: 10,
      p_audio_mime: 'audio/m4a',
    })
    expect(captionErr).not.toBeNull()

    const { error: pathErr } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_audio_url: `00000000-0000-0000-0000-000000000000/${crypto.randomUUID()}.m4a`,
      p_audio_duration_sec: 10,
      p_audio_mime: 'audio/m4a',
    })
    expect(pathErr).not.toBeNull()
  })

  it('rejects direct inserts that bypass the RPC guards', async () => {
    const { a, clusterId } = await pair()
    const path = `${clusterId}/${crypto.randomUUID()}.m4a`

    const { error: mimeErr } = await a.client.from('messages').insert({
      cluster_id: clusterId,
      author_id: a.id,
      audio_url: path,
      audio_duration_sec: 10,
      audio_mime: 'audio/wav',
    })
    expect(mimeErr).not.toBeNull()

    const { error: bothErr } = await a.client.from('messages').insert({
      cluster_id: clusterId,
      author_id: a.id,
      image_url: 'chat-images/demo.png',
      audio_url: path,
      audio_duration_sec: 10,
      audio_mime: 'audio/m4a',
    })
    expect(bothErr).not.toBeNull()
  })

  it('rejects oversized waveform arrays', async () => {
    const { a, clusterId } = await pair()
    const path = `${clusterId}/${crypto.randomUUID()}.m4a`
    await a.client.storage.from('voice-notes').upload(path, TINY_M4A, { contentType: 'audio/m4a' })

    const { error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_audio_url: path,
      p_audio_duration_sec: 10,
      p_audio_waveform: Array.from({ length: 65 }, (_, i) => i / 65),
      p_audio_mime: 'audio/m4a',
    })
    expect(error).not.toBeNull()
  })

  it('deleting a voice message removes its storage object server-side', async () => {
    const { a, b, clusterId } = await pair()
    const path = `${clusterId}/${crypto.randomUUID()}.m4a`
    await a.client.storage.from('voice-notes').upload(path, TINY_M4A, { contentType: 'audio/m4a' })
    const { data: id, error } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_audio_url: path,
      p_audio_duration_sec: 10,
      p_audio_mime: 'audio/m4a',
    })
    expect(error).toBeNull()

    const { error: delErr } = await a.client.rpc('delete_message', { p_message_id: id })
    expect(delErr).toBeNull()

    // The object is gone: even another active member can no longer sign it.
    const { error: signErr } = await b.client.storage.from('voice-notes').createSignedUrl(path, 60)
    expect(signErr).not.toBeNull()
  })

  it('rejects content edits on voice notes', async () => {
    const { a, clusterId } = await pair()
    const path = `${clusterId}/${crypto.randomUUID()}.m4a`
    await a.client.storage.from('voice-notes').upload(path, TINY_M4A, { contentType: 'audio/m4a' })
    const { data: id } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_audio_url: path,
      p_audio_duration_sec: 10,
      p_audio_mime: 'audio/m4a',
    })

    const { error } = await a.client
      .from('messages')
      .update({ content: 'sneaky caption' })
      .eq('id', id)
    expect(error).not.toBeNull()
  })

  it('voice notes fan out a duration push preview', async () => {
    const { a, b, clusterId } = await pair()
    const { error: regErr } = await b.client.rpc('register_push_token', {
      p_expo_push_token: `ExponentPushToken[voice-${b.id.slice(0, 8)}]`,
    })
    expect(regErr).toBeNull()
    const path = `${clusterId}/${crypto.randomUUID()}.m4a`
    await a.client.storage.from('voice-notes').upload(path, TINY_M4A, { contentType: 'audio/m4a' })
    await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_audio_url: path,
      p_audio_duration_sec: 65,
      p_audio_mime: 'audio/m4a',
    })

    const { data: outbox, error } = await admin
      .from('push_outbox')
      .select('user_id, body')
      .eq('user_id', b.id)
      .order('created_at', { ascending: false })
      .limit(1)
    expect(error).toBeNull()
    expect(outbox?.[0]?.body).toBe('Integration User: Voice note (1:05)')
  })
})
