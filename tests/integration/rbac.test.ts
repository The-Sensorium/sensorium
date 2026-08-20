import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  assignPlatformRole,
  createCluster,
  createUser,
  onboardUser,
  cleanup,
  type TestUser,
} from './helpers'

// Role-Based Access Control denial matrix. Staff RPCs are security definer and
// re-check actor roles from the JWT on every call, so these tests hit the real
// PostgREST path the app uses.

const admin = adminClient()
const userIds: string[] = []
const clusterIds: string[] = []

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

async function administrator(prefix: string): Promise<TestUser> {
  const u = await createUser(admin, prefix)
  userIds.push(u.id)
  await assignPlatformRole(admin, u.id, 'admin')
  return u
}

async function openReport(reporter: TestUser, target: TestUser, clusterId: string) {
  const { data, error } = await reporter.client.rpc('report_member', {
    p_cluster_id: clusterId,
    p_target_user_id: target.id,
    p_reason: 'harassment',
  })
  if (error) throw error
  return data as string
}

beforeEach(() => {
  userIds.length = 0
  clusterIds.length = 0
})

afterEach(async () => {
  await cleanup(admin, clusterIds, userIds)
})

describe('staff authorization boundary', () => {
  it('a plain member cannot call moderator queue/context RPCs', async () => {
    const a = await member('rb-mem')
    const { error: queueErr } = await a.client.rpc('get_moderation_queue')
    expect(queueErr?.message).toContain('insufficient_permission')
    const { error: ctxErr } = await a.client.rpc('get_moderation_report', {
      p_report_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(ctxErr?.message).toContain('insufficient_permission')
  })

  it('a staff role can use staff RPCs without an MFA factor', async () => {
    const u = await createUser(admin, 'rb-aal1')
    userIds.push(u.id)
    await assignPlatformRole(admin, u.id, 'moderator')
    const { error } = await u.client.rpc('get_moderation_queue')
    expect(error).toBeNull()
  })

  it('a moderator cannot grant roles', async () => {
    const m = await moderator('rb-mgrant')
    const other = await member('rb-mgrant-other')
    const { error } = await m.client.rpc('grant_platform_role', {
      p_user_id: other.id,
      p_role: 'moderator',
      p_reason: 'x',
    })
    expect(error?.message).toContain('insufficient_permission')
  })

  it('a moderator admin cannot ban accounts', async () => {
    const m = await moderator('rb-mban')
    const other = await member('rb-mban-other')
    const { error } = await m.client.rpc('apply_account_restriction', {
      p_user_id: other.id,
      p_status: 'banned',
      p_reason: 'x',
    })
    expect(error?.message).toContain('insufficient_permission')
  })

  it('an admin can read the queue and manage roles', async () => {
    const a = await member('rb-arep')
    const b = await member('rb-arep-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const adm = await administrator('rb-admin')
    const { data: queue, error: queueErr } = await adm.client.rpc('get_moderation_queue')
    expect(queueErr).toBeNull()
    expect(queue.map((r: { id: string }) => r.id)).toContain(reportId)

    const { error: grantErr } = await adm.client.rpc('grant_platform_role', {
      p_user_id: a.id,
      p_role: 'moderator',
      p_reason: 'integration grant',
    })
    expect(grantErr).toBeNull()
  })

  it('anonymous clients cannot read role or audit data', async () => {
    const anon = anonClient()
    for (const rpc of ['get_moderation_queue', 'get_moderation_audit']) {
      const { error } = await anon.rpc(rpc)
      expect(error).not.toBeNull()
    }
  })

  it('role hierarchy holds: an admin satisfies moderator checks', async () => {
    const adm = await administrator('rb-hier')
    const { data, error } = await adm.client.rpc('get_moderation_queue')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('the email lookup is admin-only and resolves profiles case-insensitively', async () => {
    const adm = await administrator('rb-lookup')
    const mod = await moderator('rb-lookup-mod')
    const target = await member('rb-lookup-target')

    const { data, error } = await adm.client.rpc('get_user_id_by_email', {
      p_email: `  ${target.email.toUpperCase()}  `,
    })
    expect(error).toBeNull()
    expect(data).toBe(target.id)

    const { data: missing, error: missingErr } = await adm.client.rpc('get_user_id_by_email', {
      p_email: 'nobody@nowhere.test',
    })
    expect(missingErr).toBeNull()
    expect(missing).toBeNull()

    const { data: matches, error: searchErr } = await adm.client.rpc('search_accounts', {
      p_query: 'lookup-target',
    })
    expect(searchErr).toBeNull()
    expect(matches).toEqual(expect.arrayContaining([{ user_id: target.id, display_name: 'Integration User', email: target.email }]))

    const { error: modErr } = await mod.client.rpc('get_user_id_by_email', {
      p_email: target.email,
    })
    expect(modErr?.message).toContain('insufficient_permission')

    const { error: modSearchErr } = await mod.client.rpc('search_accounts', { p_query: target.email })
    expect(modSearchErr?.message).toContain('insufficient_permission')

    const { error: memberErr } = await target.client.rpc('get_user_id_by_email', {
      p_email: adm.email,
    })
    expect(memberErr?.message).toContain('insufficient_permission')
  })
})

describe('report workflow enforcement', () => {
  it('claim is safe under concurrent attempts', async () => {
    const a = await member('rb-ca')
    const b = await member('rb-cb')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const m1 = await moderator('rb-cm1')
    const m2 = await moderator('rb-cm2')
    const [r1, r2] = await Promise.allSettled([
      m1.client.rpc('claim_moderation_report', { p_report_id: reportId }),
      m2.client.rpc('claim_moderation_report', { p_report_id: reportId }),
    ])

    const okCount = [r1, r2].filter((r) => r.status === 'fulfilled' && (r.value as { error: unknown }).error === null).length
    expect(okCount).toBe(1)

    const { data: report } = await admin.from('reports').select('assigned_to').eq('id', reportId).single()
    expect(report?.assigned_to).not.toBeNull()
  })

  it('invalid report status transitions are rejected', async () => {
    const a = await member('rb-tr')
    const b = await member('rb-tr-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const adm = await administrator('rb-tr-admin')
    await adm.client.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'dismissed',
      p_note: 'not found',
    })

    const { error } = await adm.client.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'actioned',
      p_note: 'reopen attempt',
    })
    expect(error?.message).toContain('invalid_status_transition')
  })

  it('actioned resolution requires a note', async () => {
    const a = await member('rb-note')
    const b = await member('rb-note-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const adm = await administrator('rb-note-admin')
    const { error } = await adm.client.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'actioned',
    })
    expect(error?.message).toContain('resolution_note_required')
  })

  it('every staff action writes exactly one audit record with the actor', async () => {
    const a = await member('rb-aud')
    const b = await member('rb-aud-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const adm = await administrator('rb-aud-admin')
    const { error: claimErr } = await adm.client.rpc('claim_moderation_report', { p_report_id: reportId })
    expect(claimErr).toBeNull()
    await adm.client.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'actioned',
      p_note: 'warning issued',
      p_action: { type: 'none' },
    })

    const { data: actions } = await admin
      .from('moderation_actions')
      .select('action, actor_id')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true })
    expect(actions).toEqual([
      { action: 'report_claimed', actor_id: adm.id },
      { action: 'report_actioned', actor_id: adm.id },
    ])
  })

  it('a revoked moderator loses staff access immediately', async () => {
    const a = await member('rb-rev')
    const b = await member('rb-rev-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    await openReport(a, b, clusterId)

    const m = await moderator('rb-rev-mod')
    const adm = await administrator('rb-rev-admin')
    const { error: revokeErr } = await adm.client.rpc('revoke_platform_role', {
      p_user_id: m.id,
      p_role: 'moderator',
      p_reason: 'revocation test',
    })
    expect(revokeErr).toBeNull()

    const { error: queueErr } = await m.client.rpc('get_moderation_queue')
    expect(queueErr?.message).toContain('insufficient_permission')
  })

  it('a report assigned to another moderator cannot be claimed', async () => {
    const a = await member('rb-hijack')
    const b = await member('rb-hijack-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const m1 = await moderator('rb-hijack-m1')
    const m2 = await moderator('rb-hijack-m2')
    const { error: claimErr } = await m1.client.rpc('claim_moderation_report', { p_report_id: reportId })
    expect(claimErr).toBeNull()

    const { error } = await m2.client.rpc('claim_moderation_report', { p_report_id: reportId })
    expect(error?.message).toContain('cannot_claim_not_open_and_unassigned')
  })

  it('the last active admin cannot be revoked', async () => {
    const adm = await administrator('rb-last')
    const { error } = await adm.client.rpc('revoke_platform_role', {
      p_user_id: adm.id,
      p_role: 'admin',
      p_reason: 'attempt',
    })
    expect(error?.message).toContain('last_admin_required')
  })

  it('a moderator cannot resolve a report they did not claim', async () => {
    const a = await member('rb-lock-a')
    const b = await member('rb-lock-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const m1 = await moderator('rb-lock-m1')
    const m2 = await moderator('rb-lock-m2')
    expect(await m1.client.rpc('claim_moderation_report', { p_report_id: reportId })).toMatchObject({ error: null })

    const { error } = await m2.client.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'dismissed',
      p_note: 'other moderator dismissal',
    })
    expect(error?.message).toContain('cannot_resolve_not_assigned_to_you')

    const { data: report } = await admin
      .from('reports')
      .select('status, assigned_to')
      .eq('id', reportId)
      .single()
    expect(report?.status).toBe('reviewing')
    expect(report?.assigned_to).toBe(m1.id)

    const { error: ownErr } = await m1.client.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'dismissed',
      p_note: 'own dismissal',
    })
    expect(ownErr).toBeNull()
  })

  it('an unclaimed pending report can be resolved by any moderator and is assigned to them', async () => {
    const a = await member('rb-solo-a')
    const b = await member('rb-solo-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const m = await moderator('rb-solo-m')
    const { error } = await m.client.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'dismissed',
      p_note: 'straight dismissal',
    })
    expect(error).toBeNull()

    const { data: report } = await admin
      .from('reports')
      .select('status, assigned_to')
      .eq('id', reportId)
      .single()
    expect(report?.status).toBe('dismissed')
    expect(report?.assigned_to).toBe(m.id)
  })

  it('hide_message with a matching report closes it as actioned', async () => {
    const a = await member('rb-hide-a')
    const b = await member('rb-hide-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const { data: messageId } = await b.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'content needing action',
    })
    const { data: reportId } = await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'harassment',
      p_message_id: messageId as string,
    })

    const m = await moderator('rb-hide-m')
    const { error } = await m.client.rpc('hide_message', {
      p_message_id: messageId as string,
      p_reason: 'guidelines',
      p_report_id: reportId as string,
    })
    expect(error).toBeNull()

    const { data: report } = await admin
      .from('reports')
      .select('status, reviewed_by, resolution_note')
      .eq('id', reportId)
      .single()
    expect(report?.status).toBe('actioned')
    expect(report?.reviewed_by).toBe(m.id)

    const { data: message } = await admin.from('messages').select('moderation_status').eq('id', messageId).single()
    expect(message?.moderation_status).toBe('rejected')
  })

  it('hide_message rejects a report that references a different message', async () => {
    const a = await member('rb-mismatch-a')
    const b = await member('rb-mismatch-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const { data: msgByA } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'my own message',
    })
    const { data: msgByB } = await b.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'reported content',
    })
    const { data: reportId } = await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'harassment',
      p_message_id: msgByB as string,
    })

    const m = await moderator('rb-mismatch-m')
    const { error } = await m.client.rpc('hide_message', {
      p_message_id: msgByA as string,
      p_reason: 'wrong message',
      p_report_id: reportId as string,
    })
    expect(error?.message).toContain('report_message_mismatch')

    const { data: message } = await admin.from('messages').select('moderation_status').eq('id', msgByA).single()
    expect(message?.moderation_status).toBe('approved')
  })

  it('hide_message with a non-existent report id is rejected', async () => {
    const a = await member('rb-norep-a')
    const b = await member('rb-norep-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const { data: messageId } = await b.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'content',
    })

    const m = await moderator('rb-norep-m')
    const { error } = await m.client.rpc('hide_message', {
      p_message_id: messageId as string,
      p_reason: 'no report',
      p_report_id: '00000000-0000-0000-0000-000000000001',
    })
    expect(error?.message).toContain('report_not_found')

    const { data: message } = await admin.from('messages').select('moderation_status').eq('id', messageId).single()
    expect(message?.moderation_status).toBe('approved')
  })

  it('issue_warning with a report id closes it as actioned', async () => {
    const a = await member('rb-warn-a')
    const b = await member('rb-warn-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const m = await moderator('rb-warn-m')
    const { error } = await m.client.rpc('issue_warning', {
      p_user_id: b.id,
      p_reason: 'first warning',
      p_report_id: reportId,
    })
    expect(error).toBeNull()

    const { data: report } = await admin
      .from('reports')
      .select('status, reviewed_by, resolution_note')
      .eq('id', reportId)
      .single()
    expect(report?.status).toBe('actioned')
    expect(report?.reviewed_by).toBe(m.id)

    const { data: actions } = await admin
      .from('moderation_actions')
      .select('action, report_id')
      .eq('target_user_id', b.id)
      .eq('action', 'warning_issued')
    expect(actions).toEqual([{ action: 'warning_issued', report_id: reportId }])
  })

  it('a suspension with a report id closes it as actioned', async () => {
    const a = await member('rb-sus-rpt-a')
    const b = await member('rb-sus-rpt-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)
    const reportId = await openReport(a, b, clusterId)

    const adm = await administrator('rb-sus-rpt-admin')
    const { error } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: b.id,
      p_status: 'suspended',
      p_reason: 'suspension from case',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      p_report_id: reportId,
    })
    expect(error).toBeNull()

    const { data: report } = await admin
      .from('reports')
      .select('status, reviewed_by')
      .eq('id', reportId)
      .single()
    expect(report?.status).toBe('actioned')
    expect(report?.reviewed_by).toBe(adm.id)

    const { data: restriction } = await admin
      .from('account_restrictions')
      .select('status')
      .eq('user_id', b.id)
      .single()
    expect(restriction?.status).toBe('suspended')
  })

  it('lifting an already-active account is a no-op', async () => {
    const target = await member('rb-active-lift')
    const adm = await administrator('rb-active-lift-admin')
    const { error } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'active',
      p_reason: 'pointless lift',
    })
    expect(error?.message).toContain('restriction_not_active')

    const { data: restriction } = await admin
      .from('account_restrictions')
      .select('status')
      .eq('user_id', target.id)
      .single()
    expect(restriction).toBeNull()

    const { data: actions } = await admin
      .from('moderation_actions')
      .select('action')
      .eq('target_user_id', target.id)
      .eq('action', 'suspension_lifted')
    expect(actions).toHaveLength(0)
  })

  it('a message author cannot change moderation fields directly', async () => {
    const a = await member('rb-author')
    const b = await member('rb-author-other')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const { data: messageId } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'hello moderator',
    })
    const { error } = await a.client
      .from('messages')
      .update({ moderation_status: 'rejected' })
      .eq('id', messageId as string)
    expect(error).not.toBeNull()
  })

  it('an admin cannot revoke their own role even when another admin exists', async () => {
    const adm = await administrator('rb-self')
    await administrator('rb-self-peer')
    const { error } = await adm.client.rpc('revoke_platform_role', {
      p_user_id: adm.id,
      p_role: 'admin',
      p_reason: 'self demotion',
    })
    expect(error?.message).toContain('cannot_revoke_self')
  })

  it('role grants create exactly one audit row and reject duplicate active assignments', async () => {
    const adm = await administrator('rb-dup')
    const target = await member('rb-dup-target')
    await adm.client.rpc('grant_platform_role', {
      p_user_id: target.id,
      p_role: 'moderator',
      p_reason: 'first',
    })
    const { error: dupErr } = await adm.client.rpc('grant_platform_role', {
      p_user_id: target.id,
      p_role: 'moderator',
      p_reason: 'second',
    })
    expect(dupErr?.message).toContain('already_assigned')

    const { data: rows } = await admin
      .from('moderation_actions')
      .select('action')
      .eq('target_user_id', target.id)
      .eq('action', 'role_granted')
    expect(rows).toHaveLength(1)
  })
})

describe('paginated role listing', () => {
  async function roleRowCount(moderatorsOnly: boolean, revoked: 'all' | 'active'): Promise<number> {
    let query = admin.from('user_roles').select('id', { count: 'exact', head: true })
    if (moderatorsOnly) query = query.eq('role', 'moderator')
    if (revoked === 'active') query = query.is('revoked_at', null)
    const { count } = await query
    return count ?? 0
  }

  it('lists active assignments with totals, filtering, and paging', async () => {
    const adm = await administrator('rb-page-admin')
    const m1 = await member('rb-page-m1')
    const m2 = await member('rb-page-m2')

    await assignPlatformRole(admin, m1.id, 'moderator')
    await assignPlatformRole(admin, m2.id, 'moderator')

    const { data: page1, error: err1 } = await adm.client.rpc('list_platform_roles_page', {
      p_limit: 2,
      p_offset: 0,
    })
    expect(err1).toBeNull()
    expect(page1).toHaveLength(2)
    expect(page1[0]?.total_count).toBe(await roleRowCount(false, 'active'))

    const { data: page2, error: err2 } = await adm.client.rpc('list_platform_roles_page', {
      p_limit: 2,
      p_offset: 2,
    })
    expect(err2).toBeNull()
    expect(page2.length).toBeGreaterThan(0)
    const allIds = [...page1.map((r: { user_id: string }) => r.user_id), ...page2.map((r: { user_id: string }) => r.user_id)]
    expect(new Set(allIds).size).toBe(allIds.length)

    const { data: mods, error: err3 } = await adm.client.rpc('list_platform_roles_page', {
      p_role: 'moderator',
    })
    expect(err3).toBeNull()
    expect(mods[0].total_count).toBe(await roleRowCount(true, 'active'))
    expect(mods.every((r: { role: string }) => r.role === 'moderator')).toBe(true)

    const { data: search, error: err4 } = await adm.client.rpc('list_platform_roles_page', {
      p_query: 'rb-page-m1',
    })
    expect(err4).toBeNull()
    expect(search).toHaveLength(1)
    expect(search[0].user_id).toBe(m1.id)

    const { data: search2, error: err4b } = await adm.client.rpc('list_platform_roles_page', {
      p_query: 'rb-page-m2',
    })
    expect(err4b).toBeNull()
    expect(search2).toHaveLength(1)
    expect(search2[0].user_id).toBe(m2.id)

    await adm.client.rpc('revoke_platform_role', {
      p_user_id: m1.id,
      p_role: 'moderator',
      p_reason: 'page test revoke',
    })

    const { data: active, error: err5 } = await adm.client.rpc('list_platform_roles_page', {
      p_role: 'moderator',
    })
    expect(err5).toBeNull()
    expect(active[0].total_count).toBe(await roleRowCount(true, 'active'))

    const { data: revokedHidden, error: err5b } = await adm.client.rpc('list_platform_roles_page', {
      p_query: 'rb-page-m1',
    })
    expect(err5b).toBeNull()
    expect(revokedHidden).toHaveLength(0)

    const { data: revokedShown, error: err5c } = await adm.client.rpc('list_platform_roles_page', {
      p_query: 'rb-page-m1',
      p_include_revoked: true,
    })
    expect(err5c).toBeNull()
    expect(revokedShown).toHaveLength(1)
    expect(revokedShown[0].user_id).toBe(m1.id)
    expect(revokedShown[0].revoked_at).not.toBeNull()

    const { data: all, error: err6 } = await adm.client.rpc('list_platform_roles_page', {
      p_role: 'moderator',
      p_include_revoked: true,
    })
    expect(err6).toBeNull()
    expect(all[0].total_count).toBe(await roleRowCount(true, 'all'))
  })

  it('is admin-only and denies moderators and members', async () => {
    const adm = await administrator('rb-page-denied')
    const m = await moderator('rb-page-mod')
    const mem = await member('rb-page-mem')

    const { error: modErr } = await m.client.rpc('list_platform_roles_page')
    expect(modErr?.message).toContain('insufficient_permission')
    const { error: memberErr } = await mem.client.rpc('list_platform_roles_page')
    expect(memberErr?.message).toContain('insufficient_permission')
    const { error: okErr } = await adm.client.rpc('list_platform_roles_page')
    expect(okErr).toBeNull()
  })
})

describe('account restrictions against direct calls', () => {
  it('a suspended user cannot send messages or submit reports', async () => {
    const a = await member('rb-sus-a')
    const b = await member('rb-sus-target')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const adm = await administrator('rb-sus-admin')
    const { error: susErr } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'suspended',
      p_reason: 'integration suspension',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(susErr).toBeNull()

    const { error: msgErr } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'should fail',
    })
    expect(msgErr).not.toBeNull()

    const { error: reportErr } = await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'harassment',
    })
    expect(reportErr).not.toBeNull()
  })

  it('a suspended staff member loses staff RPC access immediately', async () => {
    const m = await moderator('rb-susp-m')
    const adm = await administrator('rb-susp-admin')
    const { error: susErr } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: m.id,
      p_status: 'suspended',
      p_reason: 'abuse of power',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(susErr).toBeNull()

    const { error: queueErr } = await m.client.rpc('get_moderation_queue')
    expect(queueErr?.message).toContain('account_inactive')

    const { error: auditErr } = await m.client.rpc('get_moderation_audit')
    expect(auditErr?.message).toContain('account_inactive')
  })

  it('a banned staff member loses staff RPC access immediately', async () => {
    const m = await moderator('rb-banm')
    const adm = await administrator('rb-banm-admin')
    const { error: banErr } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: m.id,
      p_status: 'banned',
      p_reason: 'ban test',
    })
    expect(banErr).toBeNull()

    const { error: queueErr } = await m.client.rpc('get_moderation_queue')
    expect(queueErr?.message).toContain('account_inactive')
  })

  it('a moderator cannot downgrade a ban into a temporary suspension', async () => {
    const target = await member('rb-unban-target')
    const adm = await administrator('rb-unban-admin')
    await adm.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'banned',
      p_reason: 'permanent ban',
    })

    const mod = await moderator('rb-unban-mod')
    const { error } = await mod.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'suspended',
      p_reason: 'downgrade attempt',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(error?.message).toContain('cannot_unban')

    const { data: restriction } = await admin
      .from('account_restrictions')
      .select('status')
      .eq('user_id', target.id)
      .single()
    expect(restriction?.status).toBe('banned')
  })

  it('an admin can downgrade a ban into a temporary suspension', async () => {
    const target = await member('rb-unban-target2')
    const adm = await administrator('rb-unban-admin2')
    await adm.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'banned',
      p_reason: 'permanent ban',
    })

    const { error } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'suspended',
      p_reason: 'mercy downgrade',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(error).toBeNull()

    const { data: restriction } = await admin
      .from('account_restrictions')
      .select('status')
      .eq('user_id', target.id)
      .single()
    expect(restriction?.status).toBe('suspended')
  })

  it('a moderator cannot lift a staff member suspension (admin-only)', async () => {
    const staff = await moderator('rb-lift-staff')
    const adm = await administrator('rb-lift-admin')
    await adm.client.rpc('apply_account_restriction', {
      p_user_id: staff.id,
      p_status: 'suspended',
      p_reason: 'admin suspension of staff',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })

    const mod = await moderator('rb-lift-mod')
    const { error } = await mod.client.rpc('apply_account_restriction', {
      p_user_id: staff.id,
      p_status: 'active',
      p_reason: 'attempted staff lift',
    })
    expect(error?.message).toContain('cannot_restrict_staff')

    const { data: restriction } = await admin
      .from('account_restrictions')
      .select('status')
      .eq('user_id', staff.id)
      .single()
    expect(restriction?.status).toBe('suspended')
  })

  it('an admin can lift a staff member suspension', async () => {
    const staff = await moderator('rb-lift-ok')
    const adm = await administrator('rb-lift-ok-admin')
    await adm.client.rpc('apply_account_restriction', {
      p_user_id: staff.id,
      p_status: 'suspended',
      p_reason: 'admin suspension of staff',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })

    const { error } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: staff.id,
      p_status: 'active',
      p_reason: 'staff lift',
    })
    expect(error).toBeNull()

    const { data: restriction } = await admin
      .from('account_restrictions')
      .select('status')
      .eq('user_id', staff.id)
      .single()
    expect(restriction?.status).toBe('active')
  })

  it('every suspension requires an expiry, even from an admin', async () => {
    const target = await member('rb-null-exp')
    const adm = await administrator('rb-null-exp-admin')
    const { error } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'suspended',
      p_reason: 'suspension without expiry',
    })
    expect(error?.message).toContain('expiry_required')

    const { data: restriction } = await admin
      .from('account_restrictions')
      .select('status')
      .eq('user_id', target.id)
      .single()
    expect(restriction).toBeNull()
  })

  it('a lapsed suspension reports as active via get_my_access', async () => {
    const a = await member('rb-exp')
    const adm = await administrator('rb-exp-admin')
    const { error: susErr } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'suspended',
      p_reason: 'expired suspension',
      p_expires_at: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(susErr).toBeNull()

    const { data, error } = await a.client.rpc('get_my_access')
    expect(error).toBeNull()
    expect(data?.[0]?.account_status).toBe('active')
    expect(data?.[0]?.restriction_expires_at).toBeNull()
  })

  it('a suspended user can still delete their own account', async () => {
    const a = await member('rb-sus-del')
    const adm = await administrator('rb-sus-del-admin')
    const { error: susErr } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'suspended',
      p_reason: 'suspension',
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(susErr).toBeNull()

    const { error } = await a.client.rpc('delete_my_account')
    expect(error).toBeNull()

    const { data: user } = await admin.auth.admin.getUserById(a.id)
    expect(user.user).toBeNull()
  })

  it('a ban revokes roles, departs clusters, and starts replacement', async () => {
    const a = await member('rb-ban-a')
    const b = await member('rb-ban-b')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    await assignPlatformRole(admin, a.id, 'moderator')
    const adm = await administrator('rb-ban-admin')
    const { error } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'banned',
      p_reason: 'ban test',
    })
    expect(error).toBeNull()

    const { data: roles } = await admin
      .from('user_roles')
      .select('revoked_at')
      .eq('user_id', a.id)
      .eq('role', 'moderator')
    expect(roles![0].revoked_at).not.toBeNull()

    const { data: membership } = await admin
      .from('cluster_members')
      .select('left_at')
      .eq('cluster_id', clusterId)
      .eq('user_id', a.id)
      .single()
    expect(membership?.left_at).not.toBeNull()

    const { data: rounds } = await admin
      .from('replacement_rounds')
      .select('id')
      .eq('cluster_id', clusterId)
    expect(rounds!.length).toBeGreaterThan(0)
  })
})
