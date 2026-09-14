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

async function caseStatus(staff: TestUser, reportId: string): Promise<{ status: string; assigned_to: string | null }> {
  const { data, error } = await staff.client.rpc('get_moderation_case_v2', { p_report_id: reportId })
  if (error) throw error
  const row = (data as unknown[])[0] as { status: string; assigned_to: string | null }
  return { status: row.status, assigned_to: row.assigned_to }
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

describe('restore reopens closed reports (EOL decision A)', () => {
  it('restore_post reopens an actioned case as reviewing assigned to the restorer', async () => {
    const reporter = await member('rr-rep')
    const author = await member('rr-author')
    const modA = await moderator('rr-mod-a')
    const modB = await moderator('rr-mod-b')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, author.id] })
    clusterIds.push(clusterId)
    const postId = await makePost(clusterId, author.id, 'Reopen post body')

    const { data: reportId } = await reporter.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'spam',
    })
    await modA.client.rpc('claim_moderation_report', { p_report_id: reportId })
    const { error: hideErr } = await modA.client.rpc('hide_post', {
      p_post_id: postId,
      p_reason: 'reported content',
      p_report_id: reportId,
    })
    expect(hideErr).toBeNull()
    expect((await caseStatus(modA, reportId)).status).toBe('actioned')

    const { error: restoreErr } = await modB.client.rpc('restore_post', {
      p_post_id: postId,
      p_reason: 'false positive review',
      p_report_id: reportId,
    })
    expect(restoreErr).toBeNull()

    const reopened = await caseStatus(modB, reportId)
    expect(reopened.status).toBe('reviewing')
    expect(reopened.assigned_to).toBe(modB.id)

    const { data: timeline } = await modB.client.rpc('get_moderation_case_timeline', {
      p_report_id: reportId,
    })
    const actions = (timeline as { kind: string; action: string }[])
      .filter((e) => e.kind === 'action')
      .map((e) => e.action)
    expect(actions).toContain('post_restored')
  })

  it('restore_post_comment reopens an actioned case', async () => {
    const reporter = await member('rr-rep2')
    const author = await member('rr-author2')
    const mod = await moderator('rr-mod2')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, author.id] })
    clusterIds.push(clusterId)
    const postId = await makePost(clusterId, author.id, 'Reopen parent post')
    const commentId = await makeComment(postId, author.id, 'Reopen comment body')

    const { data: reportId } = await reporter.client.rpc('report_post_comment', {
      p_cluster_id: clusterId,
      p_comment_id: commentId,
      p_reason: 'harassment',
    })
    await mod.client.rpc('claim_moderation_report', { p_report_id: reportId })
    await mod.client.rpc('hide_post_comment', {
      p_comment_id: commentId,
      p_reason: 'reported content',
      p_report_id: reportId,
    })
    expect((await caseStatus(mod, reportId)).status).toBe('actioned')

    const { error: restoreErr } = await mod.client.rpc('restore_post_comment', {
      p_comment_id: commentId,
      p_reason: 'false positive review',
      p_report_id: reportId,
    })
    expect(restoreErr).toBeNull()
    expect((await caseStatus(mod, reportId)).status).toBe('reviewing')
  })

  it('restore on an open case keeps the close-as-actioned semantics', async () => {
    const reporter = await member('rr-rep3')
    const author = await member('rr-author3')
    const mod = await moderator('rr-mod3')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, author.id] })
    clusterIds.push(clusterId)
    const postId = await makePost(clusterId, author.id, 'Open-case restore body')

    const { data: reportId } = await reporter.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'spam',
    })
    await mod.client.rpc('claim_moderation_report', { p_report_id: reportId })
    await mod.client.rpc('hide_post', { p_post_id: postId, p_reason: 'reported content' })
    expect((await caseStatus(mod, reportId)).status).toBe('reviewing')

    const { error: restoreErr } = await mod.client.rpc('restore_post', {
      p_post_id: postId,
      p_reason: 'false positive review',
      p_report_id: reportId,
    })
    expect(restoreErr).toBeNull()
    expect((await caseStatus(mod, reportId)).status).toBe('actioned')
  })

  it('restore on someone else’s reviewing case is still denied', async () => {
    const reporter = await member('rr-rep4')
    const author = await member('rr-author4')
    const modA = await moderator('rr-mod4a')
    const modB = await moderator('rr-mod4b')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, author.id] })
    clusterIds.push(clusterId)
    const postId = await makePost(clusterId, author.id, 'Assigned case body')

    const { data: reportId } = await reporter.client.rpc('report_post', {
      p_cluster_id: clusterId,
      p_post_id: postId,
      p_reason: 'spam',
    })
    await modA.client.rpc('claim_moderation_report', { p_report_id: reportId })
    await modA.client.rpc('hide_post', { p_post_id: postId, p_reason: 'reported content' })

    const { error: restoreErr } = await modB.client.rpc('restore_post', {
      p_post_id: postId,
      p_reason: 'false positive review',
      p_report_id: reportId,
    })
    expect(restoreErr?.message).toContain('cannot_resolve_not_assigned_to_you')
  })

  it('audit v2 returns the stored policy_code for enforcement actions', async () => {
    const target = await member('rr-pol-target')
    const adm = await createUser(admin, 'rr-pol-adm')
    userIds.push(adm.id)
    await assignPlatformRole(admin, adm.id, 'admin')

    const { error: restrictErr } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'suspended',
      p_reason: 'policy code probe',
      p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      p_policy_code: 'spam',
    })
    expect(restrictErr).toBeNull()

    const { data, error } = await adm.client.rpc('get_moderation_audit_v2', {
      p_filters: { target_id: target.id },
    })
    expect(error).toBeNull()
    const rows = data as { action: string; policy_code: string | null }[]
    const suspension = rows.find((r) => r.action === 'suspension_applied')
    expect(suspension?.policy_code).toBe('spam')
  })
})
