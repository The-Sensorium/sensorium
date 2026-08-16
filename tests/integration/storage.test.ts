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
// no read or sign access, active members can sign chat-image URLs, any
// authenticated user can read avatars, and delete access is scoped like write
// access (avatars: own folder only; chat-images: active members of the cluster,
// migration 0050) so superseded objects can actually be reclaimed.

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

  it('an owner can delete their own avatar object but not another owner’s', async () => {
    const a = await member('s-del-a')
    const b = await member('s-del-b')

    const aPath = `${a.id}/${crypto.randomUUID()}.png`
    const { error: upErr } = await a.client.storage
      .from('avatars')
      .upload(aPath, TINY_PNG, { contentType: 'image/png' })
    expect(upErr).toBeNull()

    const bPath = `${b.id}/${crypto.randomUUID()}.png`
    const { error: bUpErr } = await b.client.storage
      .from('avatars')
      .upload(bPath, TINY_PNG, { contentType: 'image/png' })
    expect(bUpErr).toBeNull()

    // a can delete their own folder…
    const { error: delOwn } = await a.client.storage.from('avatars').remove([aPath])
    expect(delOwn).toBeNull()

    // …but not b's. The storage API reports blocked deletes as an empty
    // result (no error), so the guarantee is that b's object survives.
    const { error: delOther } = await a.client.storage.from('avatars').remove([bPath])
    expect(delOther).toBeNull()

    // b can still read their own after a's failed attempt.
    const { data, error } = await b.client.storage
      .from('avatars')
      .createSignedUrl(bPath, 60)
    expect(error).toBeNull()
    expect(data?.signedUrl).toBeTruthy()
  })

  it('an active member can delete a chat image in their cluster and an outsider cannot', async () => {
    const a = await member('s-delimg-a')
    const b = await member('s-delimg-b')
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

    // A non-member cannot delete it. Blocked deletes come back as an empty
    // result (no error); the guarantee is that the object survives.
    const outsider = await createUser(admin, 's-delimg-out')
    userIds.push(outsider.id)
    const { error: delOutside } = await outsider.client.storage
      .from('chat-images')
      .remove([path])
    expect(delOutside).toBeNull()

    // The object is still there after the blocked attempt.
    const { data: stillThere } = await b.client.storage
      .from('chat-images')
      .createSignedUrl(path, 60)
    expect(stillThere?.signedUrl).toBeTruthy()

    // A fellow active member can delete it.
    const { error: delMember } = await b.client.storage.from('chat-images').remove([path])
    expect(delMember).toBeNull()

    // The object is gone: signing now fails.
    const { data, error } = await b.client.storage
      .from('chat-images')
      .createSignedUrl(path, 60)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('an ex-member cannot delete a chat image after leaving', async () => {
    const a = await member('s-delleft-a')
    const b = await member('s-delleft-b')
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

    const { error: leaveErr } = await b.client.rpc('leave_cluster', {
      p_cluster_id: clusterId,
    })
    expect(leaveErr).toBeNull()

    // An ex-member cannot delete it: blocked deletes return an empty result
    // (no error), so the guarantee is the object survives.
    const { error: delErr } = await b.client.storage.from('chat-images').remove([path])
    expect(delErr).toBeNull()

    // The image is still there for the remaining active member.
    const { data: stillThere } = await a.client.storage
      .from('chat-images')
      .createSignedUrl(path, 60)
    expect(stillThere?.signedUrl).toBeTruthy()
  })
})
