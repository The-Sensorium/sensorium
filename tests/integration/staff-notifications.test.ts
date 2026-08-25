import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  assignPlatformRole,
  cleanup,
  createCluster,
  createUser,
  onboardUser,
  type TestUser,
} from './helpers'

// Staff notifications: new reports/appeals fan out a per-user `report_new` /
// `appeal_new` row to each eligible staff member, the staff unread RPCs, the
// self-notification exclusion, and the exclusion of staff events from the
// shared member read path.

describe('staff notifications', () => {
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
    await onboardUser(admin, u.id, { dob: '1995-01-15' })
    return u
  }

  async function staff(prefix: string, role: 'moderator' | 'admin'): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await assignPlatformRole(admin, u.id, role)
    return u
  }

  async function reportTarget(as: TestUser, clusterId: string, target: TestUser): Promise<string> {
    const { data: reportId, error } = await as.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'harassment',
      p_details: 'integration report',
    })
    expect(error).toBeNull()
    expect(reportId).toBeTruthy()
    return reportId
  }

  // Notify a staff member who files an appeal: newest admins only.
  async function suspendAndAppeal(as: TestUser, by: TestUser) {
    const { error: susErr } = await by.client.rpc('apply_account_restriction', {
      p_user_id: as.id,
      p_status: 'suspended',
      p_reason: 'integration suspension',
      p_expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    })
    expect(susErr).toBeNull()
    const { data: appealId, error: appealErr } = await as.client.rpc('submit_appeal', {
      p_details: 'I was wrongly suspended.',
    })
    expect(appealErr).toBeNull()
    return appealId
  }

  it('a report notifies every active moderator and admin, and only them', async () => {
    const mod = await staff('sn-mod', 'moderator')
    const adm = await staff('sn-adm', 'admin')
    const reporter = await member('sn-rep')
    const target = await member('sn-tgt')
    const outsider = await member('sn-out')
    const clusterId = await createCluster(admin, {
      memberIds: [reporter.id, target.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await reportTarget(reporter, clusterId, target)

    const { data: rows } = await admin
      .from('notifications')
      .select('user_id')
      .eq('type', 'report_new')
      .eq('cluster_id', clusterId)
    const notified = (rows ?? []).map((r) => r.user_id)
    expect(notified.sort()).toEqual([adm.id, mod.id].sort())
    expect(notified).not.toContain(reporter.id)
    expect(notified).not.toContain(target.id)
    expect(notified).not.toContain(outsider.id)
  })

  it('a staff member who files a report does not self-notify', async () => {
    const mod = await staff('sn-self-mod', 'moderator')
    const reporter = await member('sn-self-rep')
    const target = await member('sn-self-tgt')
    const clusterId = await createCluster(admin, {
      memberIds: [mod.id, reporter.id, target.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // The moderator files a report AND a plain member files a report.
    await reportTarget(mod, clusterId, target)
    await reportTarget(reporter, clusterId, target)

    const { data: rows } = await admin
      .from('notifications')
      .select('user_id')
      .eq('type', 'report_new')
      .eq('cluster_id', clusterId)
    const modRows = (rows ?? []).filter((r) => r.user_id === mod.id)
    // Only the member's report notifies the moderator; their own is excluded.
    expect(modRows).toHaveLength(1)
  })

  it('an appeal notifies admins only, not moderators', async () => {
    const adm = await staff('sn-app-adm', 'admin')
    const mod = await staff('sn-app-mod', 'moderator')
    const appellant = await member('sn-app-acc')

    await suspendAndAppeal(appellant, adm)

    const { data: rows } = await admin.from('notifications').select('user_id').eq('type', 'appeal_new')
    const notified = (rows ?? []).map((r) => r.user_id)
    expect(notified).toContain(adm.id)
    expect(notified).not.toContain(mod.id)
    expect(notified).not.toContain(appellant.id)
  })

  it('get_staff_unread_counts returns counts per role and 0 for members', async () => {
    const mod = await staff('sn-count-mod', 'moderator')
    const adm = await staff('sn-count-adm', 'admin')
    const memberUser = await member('sn-count-mem')
    const reporter = await member('sn-count-rep')
    const target = await member('sn-count-tgt')
    const clusterId = await createCluster(admin, {
      memberIds: [reporter.id, target.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await reportTarget(reporter, clusterId, target)
    await suspendAndAppeal(await member('sn-count-apt'), adm)

    const { data: modCount } = await mod.client.rpc('get_staff_unread_counts')
    expect(modCount).toEqual([{ reports: 1, appeals: 0 }])

    const { data: admCount } = await adm.client.rpc('get_staff_unread_counts')
    expect(admCount).toEqual([{ reports: 1, appeals: 1 }])

    const { data: memCount } = await memberUser.client.rpc('get_staff_unread_counts')
    expect(memCount).toEqual([{ reports: 0, appeals: 0 }])
  })

  it('mark_staff_notifications_read clears only the caller rows', async () => {
    const modA = await staff('sn-read-a', 'moderator')
    const modB = await staff('sn-read-b', 'moderator')
    const reporter = await member('sn-read-rep')
    const target = await member('sn-read-tgt')
    const clusterId = await createCluster(admin, {
      memberIds: [reporter.id, target.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    await reportTarget(reporter, clusterId, target)

    const { error: markErr } = await modA.client.rpc('mark_staff_notifications_read', {
      p_type: 'report_new',
    })
    expect(markErr).toBeNull()

    const { data: aCount } = await modA.client.rpc('get_staff_unread_counts')
    expect(aCount).toEqual([{ reports: 0, appeals: 0 }])
    const { data: bCount } = await modB.client.rpc('get_staff_unread_counts')
    expect(bCount).toEqual([{ reports: 1, appeals: 0 }])
  })

  it('denies non-staff (and moderators for appeals) mark_staff_notifications_read', async () => {
    const mem = await member('sn-denymem')
    const mod = await staff('sn-denymod', 'moderator')

    const { error: memberErr } = await mem.client.rpc('mark_staff_notifications_read', {
      p_type: 'report_new',
    })
    expect(memberErr?.message).toContain('insufficient_permission')

    // A moderator holds can_moderate (reports) but not can_manage_roles (appeals).
    const { error: modErr } = await mod.client.rpc('mark_staff_notifications_read', {
      p_type: 'appeal_new',
    })
    expect(modErr?.message).toContain('insufficient_permission')
  })

  it('get_moderation_queue and list_appeals_page honor the order direction', async () => {
    const mod = await staff('sq-mod', 'moderator')
    const adm = await staff('sq-adm', 'admin')
    const a = await member('sq-a')
    const b = await member('sq-b')
    const c = await member('sq-c')
    const clusterId = await createCluster(admin, {
      memberIds: [a.id, b.id, c.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // Two reports (distinct target so the duplicate guard allows both). Each
    // runs in its own transaction, so created_at strictly increases.
    const first = await reportTarget(a, clusterId, b)
    const second = await reportTarget(a, clusterId, c)

    const { data: desc } = await mod.client.rpc('get_moderation_queue', { p_order: 'desc' })
    const descIds = ((desc ?? []) as { id: string }[]).map((r) => r.id)
    expect(descIds.indexOf(second)).toBeGreaterThanOrEqual(0)
    expect(descIds.indexOf(second)).toBeLessThan(descIds.indexOf(first))

    const { data: asc } = await mod.client.rpc('get_moderation_queue', { p_order: 'asc' })
    const ascIds = ((asc ?? []) as { id: string }[]).map((r) => r.id)
    expect(ascIds.indexOf(first)).toBeLessThan(ascIds.indexOf(second))

    // Appeals: two restricted members each submit, then flip the order.
    const apt1 = await member('sq-apt1')
    const apt2 = await member('sq-apt2')
    await suspendAndAppeal(apt1, adm)
    await suspendAndAppeal(apt2, adm)

    const { data: apDesc } = await adm.client.rpc('list_appeals_page', { p_order: 'desc' })
    const apDescOrder = ((apDesc ?? []) as { id: string; created_at: string }[])
    expect(apDescOrder[0]!.created_at >= apDescOrder[1]!.created_at).toBe(true)

    const { data: apAsc } = await adm.client.rpc('list_appeals_page', { p_order: 'asc' })
    const apAscOrder = ((apAsc ?? []) as { id: string; created_at: string }[])
    expect(apAscOrder[0]!.created_at <= apAscOrder[1]!.created_at).toBe(true)
  })

  it('excludes staff events from the shared member read path', async () => {
    const mod = await staff('sn-path-mod', 'moderator')
    const reporter = await member('sn-path-rep')
    const target = await member('sn-path-tgt')
    const clusterId = await createCluster(admin, {
      memberIds: [reporter.id, target.id],
      status: 'active',
    })
    clusterIds.push(clusterId)

    // The moderator gets a `report_new` staff event...
    await reportTarget(reporter, clusterId, target)

    // ...and, as a separate concern, a discrete member event (a reaction).
    const { error: injErr } = await admin.from('notifications').insert({
      user_id: mod.id,
      type: 'reaction',
      cluster_id: clusterId,
      title: 'Someone reacted',
    })
    expect(injErr).toBeNull()

    const { data: list } = await mod.client.rpc('get_my_notifications')
    const types = ((list ?? []) as { type: string }[]).map((n) => n.type)
    expect(types).toContain('reaction')
    expect(types).not.toContain('report_new')
    expect(types).not.toContain('appeal_new')

    const { data: unread } = await mod.client.rpc('get_unread_notification_count')
    expect(unread).toBe(1)
  })
})
