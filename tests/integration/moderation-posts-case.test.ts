import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  assignPlatformRole,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

const admin = adminClient()
const userIds: string[] = []
const clusterIds: string[] = []
const postIds: string[] = []

async function member(prefix: string): Promise<TestUser> {
  const u = await createUser(admin, prefix)
  userIds.push(u.id)
  await onboardUser(admin, u.id, { dob: '1996-04-02' })
  return u
}

async function moderator(prefix: string): Promise<TestUser> {
  const u = await createUser(admin, prefix)
  userIds.push(u.id)
  await assignPlatformRole(admin, u.id, 'moderator')
  return u
}

async function makePost(clusterId: string, authorId: string, content: string): Promise<string> {
  const { data, error } = await admin
    .from('posts')
    .insert({ cluster_id: clusterId, author_id: authorId, content })
    .select('id')
    .single()
  if (error) throw error
  postIds.push(data.id)
  return data.id as string
}

async function makeComment(postId: string, authorId: string, content: string): Promise<string> {
  const { data, error } = await admin
    .from('post_comments')
    .insert({ post_id: postId, author_id: authorId, content })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

beforeEach(() => {
  userIds.length = 0
  clusterIds.length = 0
  postIds.length = 0
})

afterEach(async () => {
  if (postIds.length) await admin.from('posts').delete().in('id', postIds)
  await cleanup(admin, clusterIds, userIds)
})

describe('post/comment staff moderation (phase 3)', () => {
  it('staff case reads expose post context; members are denied', async () => {
    const reporter = await member('pc-rep')
    const author = await member('pc-author')
    const mod = await moderator('pc-mod')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, author.id] })
    clusterIds.push(clusterId)
    const postId = await makePost(clusterId, author.id, 'Reported post body')

    const { data: reportId, error: reportErr } = await reporter.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'spam',
      p_details: 'post case check',
    })
    expect(reportErr).toBeNull()

    const { error: denied } = await reporter.client.rpc('get_moderation_case_v2', { p_report_id: reportId })
    expect(denied?.message).toContain('insufficient_permission')

    const { data, error } = await mod.client.rpc('get_moderation_case_v2', { p_report_id: reportId })
    expect(error).toBeNull()
    const row = (data as unknown[])[0] as {
      target_kind: string
      post: { id: string; content: string; author_display_name: string; moderation_status: string }
    }
    expect(row.target_kind).toBe('post')
    expect(row.post.id).toBe(postId)
    expect(row.post.content).toBe('Reported post body')
    expect(row.post.moderation_status).toBe('approved')
  })

  it('comment reports carry parent post context and hide closes the case', async () => {
    const reporter = await member('pc-rep2')
    const author = await member('pc-author2')
    const mod = await moderator('pc-mod2')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, author.id] })
    clusterIds.push(clusterId)
    const postId = await makePost(clusterId, author.id, 'Parent post body')
    const commentId = await makeComment(postId, author.id, 'Reported comment body')

    const { data: reportId, error: reportErr } = await reporter.client.rpc('report_post_comment', {
      p_cluster_id: clusterId,
      p_comment_id: commentId,
      p_reason: 'harassment',
    })
    expect(reportErr).toBeNull()

    const { data, error } = await mod.client.rpc('get_moderation_case_v2', { p_report_id: reportId })
    expect(error).toBeNull()
    const row = (data as unknown[])[0] as {
      target_kind: string
      comment: { id: string; content: string; post_snippet: string }
    }
    expect(row.target_kind).toBe('comment')
    expect(row.comment.content).toBe('Reported comment body')
    expect(row.comment.post_snippet).toContain('Parent post body')

    await mod.client.rpc('claim_moderation_report', { p_report_id: reportId })
    const { error: hideErr } = await mod.client.rpc('hide_post_comment', {
      p_comment_id: commentId,
      p_reason: 'harassment in thread',
      p_report_id: reportId,
    })
    expect(hideErr).toBeNull()

    const { data: after } = await mod.client.rpc('get_moderation_case_v2', { p_report_id: reportId })
    const closed = (after as unknown[])[0] as { status: string; comment: { moderation_status: string } }
    expect(closed.status).toBe('actioned')
    expect(closed.comment.moderation_status).toBe('rejected')
  })

  it('hide_post closes the report and is visible in the timeline', async () => {
    const reporter = await member('pc-rep3')
    const author = await member('pc-author3')
    const mod = await moderator('pc-mod3')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, author.id] })
    clusterIds.push(clusterId)
    const postId = await makePost(clusterId, author.id, 'Another reported post')

    const { data: reportId } = await reporter.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'inappropriate_content',
    })
    await mod.client.rpc('claim_moderation_report', { p_report_id: reportId })
    const { error: hideErr } = await mod.client.rpc('hide_post', {
      p_post_id: postId,
      p_reason: 'inappropriate imagery',
      p_report_id: reportId,
    })
    expect(hideErr).toBeNull()

    const { data: timeline } = await mod.client.rpc('get_moderation_case_timeline', { p_report_id: reportId })
    const actions = (timeline as { kind: string; action: string }[])
      .filter((e) => e.kind === 'action')
      .map((e) => e.action)
    expect(actions).toContain('post_hidden')
  })
})
