import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  assignPlatformRole,
  cleanup,
  createCluster,
  createUser,
  onboardUser,
  TINY_PNG,
  type TestUser,
} from './helpers'

describe('posts RLS + RPC', () => {
  const admin = adminClient()
  const anon = anonClient()
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

  /** a + b are active members; c is not. */
  async function wireCluster(): Promise<{ a: TestUser; b: TestUser; c: TestUser; clusterId: string }> {
    const a = await member('posts-a')
    const b = await member('posts-b')
    const c = await member('posts-c')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    return { a, b, c, clusterId }
  }

  async function createPost(a: TestUser, clusterId: string, content = 'hello'): Promise<string> {
    const { data, error } = await a.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: content,
      p_image_url: null,
      p_gif_url: null,
    })
    expect(error).toBeNull()
    return data as string
  }

  it('a member creates a post that active members see but non-members and anon do not', async () => {
    const { a, b, c, clusterId } = await wireCluster()
    const postId = await createPost(a, clusterId)

    const { data: memberRows } = await b.client
      .from('posts')
      .select('id')
      .eq('cluster_id', clusterId)
    expect((memberRows ?? []).map((r) => r.id)).toContain(postId)

    const { data: outsiderRows } = await c.client
      .from('posts')
      .select('id')
      .eq('cluster_id', clusterId)
    expect((outsiderRows ?? []).map((r) => r.id)).not.toContain(postId)

    const { data: anonRows } = await anon.from('posts').select('id').eq('cluster_id', clusterId)
    expect((anonRows ?? []).map((r) => r.id)).not.toContain(postId)
  })

  it('create_post rejects empty content and oversized content', async () => {
    const { a, clusterId } = await wireCluster()
    const { error: empty } = await a.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: null,
      p_image_url: null,
      p_gif_url: null,
    })
    expect(empty?.message).toMatch(/empty_post/)

    const { error: longContent } = await a.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: 'x'.repeat(2001),
      p_image_url: null,
      p_gif_url: null,
    })
    expect(longContent?.message).toMatch(/content_out_of_range/)
  })

  it('a post can carry an optional title, and it is validated for length', async () => {
    const { a, clusterId } = await wireCluster()

    const { data: postId, error: createErr } = await a.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: 'body',
      p_image_url: null,
      p_gif_url: null,
      p_title: 'Hello',
    })
    expect(createErr).toBeNull()
    expect(postId).toBeTruthy()

    const { data: post } = await admin.from('posts').select('title').eq('id', postId).single()
    expect(post?.title).toBe('Hello')

    const { error: editErr } = await a.client.rpc('edit_post', {
      p_post_id: postId,
      p_content: 'body',
      p_title: 'Updated',
    })
    expect(editErr).toBeNull()

    const { error: longErr } = await a.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: 'x',
      p_image_url: null,
      p_gif_url: null,
      p_title: 'x'.repeat(201),
    })
    expect(longErr?.message).toMatch(/title_out_of_range/)
  })

  it('create_post rejects a non-member and a locked cluster', async () => {
    const { a, c, clusterId } = await wireCluster()

    const { error: outsider } = await c.client.rpc('create_post', {
      p_cluster_id: clusterId,
      p_content: 'hi',
      p_image_url: null,
      p_gif_url: null,
    })
    expect(outsider).not.toBeNull()

    // A locked (introductions-phase) cluster rejects even active members.
    const introCluster = await createCluster(admin, {
      memberIds: [a.id],
      status: 'introductions',
    })
    clusterIds.push(introCluster)
    const { error: locked } = await a.client.rpc('create_post', {
      p_cluster_id: introCluster,
      p_content: 'hi',
      p_image_url: null,
      p_gif_url: null,
    })
    expect(locked?.message).toMatch(/posts_locked/)
  })

  it('toggle_post_like toggles a like for a member, rejects a non-member', async () => {
    const { a, c, clusterId } = await wireCluster()
    const postId = await createPost(a, clusterId)

    const { error: likeA } = await a.client.rpc('toggle_post_like', { p_post_id: postId })
    expect(likeA).toBeNull()
    const { data: count1 } = await admin
      .from('post_likes')
      .select('user_id')
      .eq('post_id', postId)
    expect(count1).toHaveLength(1)

    const { error: unlikeA } = await a.client.rpc('toggle_post_like', { p_post_id: postId })
    expect(unlikeA).toBeNull()
    const { data: count0 } = await admin
      .from('post_likes')
      .select('user_id')
      .eq('post_id', postId)
    expect(count0).toHaveLength(0)

    const { error: outsider } = await c.client.rpc('toggle_post_like', { p_post_id: postId })
    expect(outsider).not.toBeNull()
  })

  it('a member comments and deletes their own comment; non-members are rejected', async () => {
    const { a, b, c, clusterId } = await wireCluster()
    const postId = await createPost(a, clusterId)

    const { data: commentId } = await b.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'nice',
      p_image_url: null,
      p_gif_url: null,
    })
    expect(commentId).toBeTruthy()

    const { data: comments } = await a.client
      .from('post_comments')
      .select('id')
      .eq('post_id', postId)
    expect((comments ?? []).map((r) => r.id)).toContain(commentId)

    const { error: delOwn } = await b.client.rpc('delete_post_comment', { p_comment_id: commentId })
    expect(delOwn).toBeNull()
    const { data: after } = await admin
      .from('post_comments')
      .select('deleted_at')
      .eq('id', commentId)
    expect(after?.[0]?.deleted_at).not.toBeNull()

    const { error: outsider } = await c.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'nope',
      p_image_url: null,
      p_gif_url: null,
    })
    expect(outsider).not.toBeNull()
  })

  it('a comment can be replied to, and a reply can be replied to (flat, Instagram-style)', async () => {
    const { a, b, clusterId } = await wireCluster()
    const postId = await createPost(a, clusterId)

    const { data: commentId } = await b.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'top level',
      p_image_url: null,
      p_gif_url: null,
    })
    expect(commentId).toBeTruthy()

    const { data: replyId, error: replyErr } = await a.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'a reply',
      p_image_url: null,
      p_gif_url: null,
      p_parent_comment_id: commentId,
    })
    expect(replyErr).toBeNull()
    expect(replyId).toBeTruthy()

    // A reply can itself be replied to (still flat by reference).
    const { data: deepReply, error: deepErr } = await b.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'reply to the reply',
      p_image_url: null,
      p_gif_url: null,
      p_parent_comment_id: replyId,
    })
    expect(deepErr).toBeNull()
    expect(deepReply).toBeTruthy()

    const { data: rows } = await admin
      .from('post_comments')
      .select('id, parent_comment_id')
      .eq('post_id', postId)
    expect((rows ?? []).find((r) => r.id === replyId)?.parent_comment_id).toBe(commentId)
    expect((rows ?? []).find((r) => r.id === deepReply)?.parent_comment_id).toBe(replyId)

    // A reply target must exist on the same post.
    const { error: bogus } = await b.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'nope',
      p_image_url: null,
      p_gif_url: null,
      p_parent_comment_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(bogus?.message).toMatch(/invalid_reply_target/)
  })

  it('a comment/reply and a like notify the right author, and prefs gate them', async () => {
    const { a, b, clusterId } = await wireCluster()
    const postId = await createPost(a, clusterId)

    // b comments on a's post → a (post author) is notified.
    await b.client.rpc('create_post_comment', { p_post_id: postId, p_content: 'nice' })
    const { data: aNotifs } = await admin
      .from('notifications')
      .select('type, payload')
      .eq('user_id', a.id)
      .eq('type', 'post_comment')
    expect(aNotifs).toHaveLength(1)
    expect((aNotifs?.[0]?.payload as { post_id?: string })?.post_id).toBe(postId)

    // a replying to b's comment does not notify a (actor) but notifies b (parent author).
    const { data: bComment } = await admin
      .from('post_comments')
      .select('id')
      .eq('post_id', postId)
      .eq('author_id', b.id)
      .single()
    await a.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'replying to you',
      p_image_url: null,
      p_gif_url: null,
      p_parent_comment_id: bComment?.id,
    })
    const { data: bNotifs } = await admin
      .from('notifications')
      .select('type')
      .eq('user_id', b.id)
      .eq('type', 'post_comment')
    expect(bNotifs).toHaveLength(1)
    // a still only has the one notification from b's comment (a's own reply is excluded).
    const { data: aAfter } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', a.id)
      .eq('type', 'post_comment')
    expect(aAfter).toHaveLength(1)

    // b likes a's post → a is notified once; unliking does not add another.
    await b.client.rpc('toggle_post_like', { p_post_id: postId })
    const { data: likeNotifs1 } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', a.id)
      .eq('type', 'post_like')
    expect(likeNotifs1).toHaveLength(1)
    await b.client.rpc('toggle_post_like', { p_post_id: postId })
    const { data: likeNotifs2 } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', a.id)
      .eq('type', 'post_like')
    expect(likeNotifs2).toHaveLength(1)

    // Prefs gate reads: turn off comment notifications for a, then a no longer sees them.
    await admin
      .from('notification_prefs')
      .upsert({ user_id: a.id, cluster_id: clusterId, post_comment: false }, { onConflict: 'user_id,cluster_id' })
    const { data: aSees } = await a.client.rpc('get_my_notifications')
    expect((aSees as { type?: string }[] | null ?? []).some((n) => n.type === 'post_comment')).toBe(false)
  })

  it('a comment can be liked and unliked by a member; non-members are rejected', async () => {
    const { a, c, clusterId } = await wireCluster()
    const postId = await createPost(a, clusterId)
    const { data: commentId } = await a.client.rpc('create_post_comment', {
      p_post_id: postId,
      p_content: 'a comment',
      p_image_url: null,
      p_gif_url: null,
    })
    expect(commentId).toBeTruthy()

    const { error: likeErr } = await a.client.rpc('toggle_comment_like', { p_comment_id: commentId })
    expect(likeErr).toBeNull()
    const { data: likes1 } = await admin
      .from('comment_likes')
      .select('user_id')
      .eq('comment_id', commentId)
    expect(likes1).toHaveLength(1)

    const { error: unlikeErr } = await a.client.rpc('toggle_comment_like', { p_comment_id: commentId })
    expect(unlikeErr).toBeNull()
    const { data: likes0 } = await admin
      .from('comment_likes')
      .select('user_id')
      .eq('comment_id', commentId)
    expect(likes0).toHaveLength(0)

    const { error: outsider } = await c.client.rpc('toggle_comment_like', { p_comment_id: commentId })
    expect(outsider).not.toBeNull()
  })

  it('report_post guards self-reports, non-members, and duplicates', async () => {
    const { a, b, c, clusterId } = await wireCluster()
    const postId = await createPost(a, clusterId)

    const { error: self } = await a.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'spam',
      p_details: null,
    })
    expect(self?.message).toMatch(/cannot_report_self/)

    const { error: outsider } = await c.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'spam',
      p_details: null,
    })
    expect(outsider).not.toBeNull()

    const { data: reportId, error: ok } = await b.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'spam',
      p_details: 'junk',
    })
    expect(ok).toBeNull()
    expect(reportId).toBeTruthy()

    const { error: dup } = await b.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'spam',
      p_details: null,
    })
    expect(dup?.message).toMatch(/duplicate_report/)
  })

  it('a moderator hides and restores a post, invisibly to members, with an audit row', async () => {
    const { a, b, clusterId } = await wireCluster()
    await assignPlatformRole(admin, b.id, 'moderator')
    const postId = await createPost(a, clusterId)

    const { error: hideErr } = await b.client.rpc('hide_post', {
      p_post_id: postId,
      p_reason: 'spam',
      p_report_id: null,
    })
    expect(hideErr).toBeNull()

    const { data: hiddenRead } = await a.client
      .from('posts')
      .select('id')
      .eq('id', postId)
    expect((hiddenRead ?? []).length).toBe(0)

    const { data: audit } = await admin
      .from('moderation_actions')
      .select('action')
      .eq('post_id', postId)
    expect((audit ?? []).some((r) => r.action === 'post_hidden')).toBe(true)

    const { error: restoreErr } = await b.client.rpc('restore_post', {
      p_post_id: postId,
      p_reason: 'appeal upheld',
      p_report_id: null,
    })
    expect(restoreErr).toBeNull()
    const { data: restoredRead } = await a.client
      .from('posts')
      .select('id')
      .eq('id', postId)
    expect((restoredRead ?? []).map((r) => r.id)).toContain(postId)
  })

  it('posts-images is private: signed URLs work only for active members', async () => {
    const { a, c, clusterId } = await wireCluster()
    const path = `${clusterId}/${'a'.repeat(32)}.png`

    const { error: upErr } = await a.client.storage
      .from('posts-images')
      .upload(path, TINY_PNG, { contentType: 'image/png' })
    expect(upErr).toBeNull()

    const memberSigned = await a.client.storage.from('posts-images').createSignedUrl(path, 60)
    expect(memberSigned.error).toBeNull()
    expect(memberSigned.data?.signedUrl).toBeTruthy()

    const outsiderSigned = await c.client.storage.from('posts-images').createSignedUrl(path, 60)
    expect(outsiderSigned.error).not.toBeNull()

    const anonSigned = await anon.storage.from('posts-images').createSignedUrl(path, 60)
    expect(anonSigned.error).not.toBeNull()
  })
})
