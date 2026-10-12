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

// Account-deletion storage cleanup: the delete-account-storage edge function
// enumerates the account's owned objects through the service-role-only RPC
// (get_storage_objects_for_account) and deletes them through the Storage API
// under the service-role key, so objects survive even in clusters the user has
// left (the member-scoped delete policies no longer apply). These tests
// exercise that exact server path: service-role enumeration + service-role
// deletion + physical-existence checks, plus isolation and retry safety.

type OwnedObject = { bucket: string; path: string }

describe('account deletion storage cleanup', () => {
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
    await onboardUser(admin, u.id, { dob: '1994-11-02' })
    return u
  }

  /** True when the caller can sign a URL for the object, i.e. it still exists. */
  async function signable(
    client: TestUser['client'],
    bucket: string,
    path: string,
  ): Promise<boolean> {
    const { data } = await client.storage.from(bucket).createSignedUrl(path, 60)
    return Boolean(data?.signedUrl)
  }

  function keys(objects: OwnedObject[]): string[] {
    return objects.map((o) => `${o.bucket}/${o.path}`).sort()
  }

  /** Service-role enumeration, exactly what the edge function calls. */
  async function ownedBy(userId: string): Promise<OwnedObject[]> {
    const { data, error } = await admin.rpc('get_storage_objects_for_account', {
      p_user_id: userId,
    })
    expect(error).toBeNull()
    return (data ?? []) as OwnedObject[]
  }

  /** Service-role deletion, exactly what the edge function calls. */
  async function removeOwned(objects: OwnedObject[]): Promise<void> {
    for (const bucket of ['avatars', 'chat-images', 'posts-images']) {
      const paths = objects.filter((o) => o.bucket === bucket).map((o) => o.path)
      if (paths.length === 0) continue
      const { error } = await admin.storage.from(bucket).remove(paths)
      expect(error).toBeNull()
    }
  }

  /** Give user `u` an avatar, chat image, post image, and comment image. */
  async function seedOwnedObjects(u: TestUser, clusterId: string): Promise<{
    avatar: string
    chat: string
    post: string
    comment: string
  }> {
    const avatar = `${u.id}/avatar.png`
    await u.client.storage.from('avatars').upload(avatar, TINY_PNG, { contentType: 'image/png' })
    await u.client.from('profiles').update({ avatar_url: avatar }).eq('id', u.id)

    const chat = `${clusterId}/chat-${u.id}.png`
    await u.client.storage.from('chat-images').upload(chat, TINY_PNG, { contentType: 'image/png' })
    const { error: msgErr } = await u.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_image_url: chat,
    })
    expect(msgErr).toBeNull()

    const post = `${clusterId}/post-${u.id}.png`
    await u.client.storage.from('posts-images').upload(post, TINY_PNG, { contentType: 'image/png' })
    const { data: postId, error: postErr } = await u.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: 'photo post',
      p_image_url: post,
    })
    expect(postErr).toBeNull()

    const comment = `${clusterId}/comment-${u.id}.png`
    await u.client.storage.from('posts-images').upload(comment, TINY_PNG, { contentType: 'image/png' })
    const { error: commentErr } = await u.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'reply',
      p_image_url: comment,
    })
    expect(commentErr).toBeNull()

    return { avatar, chat, post, comment }
  }

  it('deletes every owned object across all buckets and leaves other users untouched', async () => {
    const a = await member('ads-a')
    const b = await member('ads-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const aOwned = await seedOwnedObjects(a, clusterId)
    const bOwned = await seedOwnedObjects(b, clusterId)

    // 1) Service-role enumeration is exactly the account's own objects.
    const list = await ownedBy(a.id)
    expect(keys(list)).toEqual(
      [
        `avatars/${aOwned.avatar}`,
        `chat-images/${aOwned.chat}`,
        `posts-images/${aOwned.post}`,
        `posts-images/${aOwned.comment}`,
      ].sort(),
    )
    expect(keys(list)).not.toContain(`posts-images/${bOwned.post}`)
    expect(keys(list)).not.toContain(`chat-images/${bOwned.chat}`)

    // 2) Delete, then delete again: repeated attempts are safe and idempotent.
    await removeOwned(list)
    for (const object of list) {
      expect(await signable(b.client, object.bucket, object.path)).toBe(false)
    }
    await removeOwned(await ownedBy(a.id))
    for (const object of list) {
      expect(await signable(b.client, object.bucket, object.path)).toBe(false)
    }

    // 3) Delete the account; owned rows and the auth user are gone.
    const { error: delErr } = await a.client.rpc('delete_my_account')
    expect(delErr).toBeNull()
    const { data: user } = await admin.auth.admin.getUserById(a.id)
    expect(user.user).toBeNull()
    expect((await ownedBy(a.id)).length).toBe(0)

    // 4) B's objects survive the whole deletion.
    expect(await signable(b.client, 'avatars', bOwned.avatar)).toBe(true)
    expect(await signable(b.client, 'chat-images', bOwned.chat)).toBe(true)
    expect(await signable(b.client, 'posts-images', bOwned.post)).toBe(true)
    expect(await signable(b.client, 'posts-images', bOwned.comment)).toBe(true)
  })

  it('deletes objects in clusters the user has already left', async () => {
    const a = await member('ads-left-a')
    const b = await member('ads-left-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const aOwned = await seedOwnedObjects(a, clusterId)
    const bOwned = await seedOwnedObjects(b, clusterId)

    // A leaves the cluster: the member-scoped delete policies no longer apply.
    const { error: leaveErr } = await a.client.rpc('leave_cluster', {
      p_cluster_id: clusterId,
    })
    expect(leaveErr).toBeNull()

    // The user's own signed-in delete no longer reaches the objects: blocked
    // deletes return an empty result (no error) and the object survives.
    const { error: blocked } = await a.client.storage
      .from('chat-images')
      .remove([aOwned.chat])
    expect(blocked).toBeNull()
    expect(await signable(b.client, 'chat-images', aOwned.chat)).toBe(true)
    expect(await signable(b.client, 'posts-images', aOwned.post)).toBe(true)

    // The server path (service-role enumeration + Storage API) still reclaims
    // them, so physical deletion no longer depends on membership.
    const list = await ownedBy(a.id)
    expect(keys(list)).toEqual(
      [
        `avatars/${aOwned.avatar}`,
        `chat-images/${aOwned.chat}`,
        `posts-images/${aOwned.post}`,
        `posts-images/${aOwned.comment}`,
      ].sort(),
    )
    await removeOwned(list)
    for (const object of list) {
      expect(await signable(b.client, object.bucket, object.path)).toBe(false)
    }

    const { error: delErr } = await a.client.rpc('delete_my_account')
    expect(delErr).toBeNull()
    expect((await ownedBy(a.id)).length).toBe(0)

    // B's objects remain untouched.
    expect(await signable(b.client, 'avatars', bOwned.avatar)).toBe(true)
    expect(await signable(b.client, 'chat-images', bOwned.chat)).toBe(true)
    expect(await signable(b.client, 'posts-images', bOwned.post)).toBe(true)
  })

  it('storage enumeration RPCs are scoped and never expose another account', async () => {
    const a = await member('ads-scope-a')
    const b = await member('ads-scope-b')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    const aOwned = await seedOwnedObjects(a, clusterId)
    await seedOwnedObjects(b, clusterId)

    // get_my_storage_objects is author-scoped for the signed-in user.
    const { data: aList } = await a.client.rpc('get_my_storage_objects')
    expect(keys((aList ?? []) as OwnedObject[])).toEqual(
      [
        `avatars/${aOwned.avatar}`,
        `chat-images/${aOwned.chat}`,
        `posts-images/${aOwned.post}`,
        `posts-images/${aOwned.comment}`,
      ].sort(),
    )

    // get_storage_objects_for_account is service-role-only: neither anon nor a
    // signed-in user can read (or delete) another account's object list.
    const anon = anonClient()
    const { error: anonErr } = await anon.rpc('get_storage_objects_for_account', {
      p_user_id: a.id,
    })
    expect(anonErr).not.toBeNull()
    const { error: aErr } = await a.client.rpc('get_storage_objects_for_account', {
      p_user_id: a.id,
    })
    expect(aErr).not.toBeNull()
  })
})