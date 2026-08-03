import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  TINY_PNG,
  type TestUser,
} from './helpers'

// Storage hardening: the chat-images and avatars buckets are private, anon has
// no read or sign access, active members can sign chat-image URLs, and any
// authenticated user can read avatars.

describe('storage security', () => {
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

  it('chat-images bucket is private: anon cannot list or read objects', async () => {
    const anon = anonClient()
    const { data, error } = await anon.storage.from('chat-images').list()
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('avatars bucket is private: anon cannot list or read objects', async () => {
    const anon = anonClient()
    const { data, error } = await anon.storage.from('avatars').list()
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('anon cannot sign URLs in the private buckets', async () => {
    const anon = anonClient()
    const { error: chat } = await anon.storage
      .from('chat-images')
      .createSignedUrl('00000000-0000-0000-0000-000000000000/nope.png', 60)
    expect(chat).not.toBeNull()

    const { error: av } = await anon.storage
      .from('avatars')
      .createSignedUrl('00000000-0000-0000-0000-000000000000/nope.png', 60)
    expect(av).not.toBeNull()
  })

  it('a cluster member can upload and sign a chat image', async () => {
    const a = await member('s-chat-a')
    const b = await member('s-chat-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const path = `${clusterId}/${crypto.randomUUID()}.png`
    const { error: upErr } = await a.client.storage
      .from('chat-images')
      .upload(path, TINY_PNG, { contentType: 'image/png' })
    expect(upErr).toBeNull()

    // Any active member can create a signed URL.
    const { data: signed, error } = await b.client.storage
      .from('chat-images')
      .createSignedUrl(path, 60)
    expect(error).toBeNull()
    expect(signed?.signedUrl).toContain(clusterId)

    // The signed URL actually serves the object bytes.
    const res = await fetch(signed!.signedUrl)
    expect(res.ok).toBe(true)
    expect((await res.arrayBuffer()).byteLength).toBe(TINY_PNG.length)
  })

  it('a non-member cannot sign a chat image in another cluster', async () => {
    const a = await member('s-chat2-a')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const path = `${clusterId}/${crypto.randomUUID()}.png`
    await a.client.storage.from('chat-images').upload(path, TINY_PNG, {
      contentType: 'image/png',
    })

    const outsider = await createUser(admin, 's-chat2-out')
    userIds.push(outsider.id)
    const { data, error } = await outsider.client.storage
      .from('chat-images')
      .createSignedUrl(path, 60)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('a member cannot upload a chat image outside their cluster folder', async () => {
    const a = await member('s-other-a')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const otherClusterId = crypto.randomUUID()
    const path = `${otherClusterId}/${crypto.randomUUID()}.png`
    const { error } = await a.client.storage
      .from('chat-images')
      .upload(path, TINY_PNG, { contentType: 'image/png' })
    expect(error).not.toBeNull()
  })

  it('avatars upload is scoped to the owners folder and readable by any authenticated user', async () => {
    const a = await member('s-av-a')
    const b = await member('s-av-b')

    const path = `${a.id}/${crypto.randomUUID()}.png`
    const { error: upErr } = await a.client.storage
      .from('avatars')
      .upload(path, TINY_PNG, { contentType: 'image/png' })
    expect(upErr).toBeNull()

    // Another authenticated user can sign it.
    const { data: signed, error } = await b.client.storage
      .from('avatars')
      .createSignedUrl(path, 60)
    expect(error).toBeNull()
    expect(signed?.signedUrl).toContain(a.id)

    const res = await fetch(signed!.signedUrl)
    expect(res.ok).toBe(true)
    expect((await res.arrayBuffer()).byteLength).toBe(TINY_PNG.length)
  })

  it('a user cannot upload an avatar into another user folder', async () => {
    const a = await member('s-av2-a')
    const b = await member('s-av2-b')

    const path = `${b.id}/${crypto.randomUUID()}.png`
    const { error } = await a.client.storage
      .from('avatars')
      .upload(path, TINY_PNG, { contentType: 'image/png' })
    expect(error).not.toBeNull()
  })
})
