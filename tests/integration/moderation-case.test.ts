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

async function openReportId(reporter: TestUser, target: TestUser, clusterId: string): Promise<string> {
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

describe('moderation case workspace (phase 2)', () => {
  it('members cannot read cases, timelines, or write notes', async () => {
    const reporter = await member('cw-rep')
    const target = await member('cw-tgt')
    const outsider = await member('cw-out')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)
    const reportId = await openReportId(reporter, target, clusterId)

    for (const rpc of ['get_moderation_case_v2', 'get_moderation_case_timeline'] as const) {
      const { error } = await outsider.client.rpc(rpc, { p_report_id: reportId })
      expect(error?.message).toContain('insufficient_permission')
    }
    const { error: noteErr } = await outsider.client.rpc('add_moderation_case_note', {
      p_report_id: reportId,
      p_note: 'sneaky',
    })
    expect(noteErr?.message).toContain('insufficient_permission')
  })

  it('case v2 exposes reporter and target context to moderators', async () => {
    const reporter = await member('cw-rep2')
    const target = await member('cw-tgt2')
    const mod = await moderator('cw-mod2')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)
    const reportId = await openReportId(reporter, target, clusterId)

    const { data, error } = await mod.client.rpc('get_moderation_case_v2', { p_report_id: reportId })
    expect(error).toBeNull()
    const row = (data as unknown[])[0] as {
      target_kind: string
      severity: string
      reporter: { display_name: string; total_reports: number }
      target: { display_name: string; account_status: string; prior_reports: number }
    }
    expect(row.target_kind).toBe('member')
    expect(row.severity).toBe('high')
    expect(row.reporter.total_reports).toBeGreaterThanOrEqual(1)
    expect(row.target.account_status).toBe('active')
  })

  it('notes are staff-only, author-scoped for edit, and appear in the timeline', async () => {
    const reporter = await member('cw-rep3')
    const target = await member('cw-tgt3')
    const modA = await moderator('cw-modA')
    const modB = await moderator('cw-modB')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)
    const reportId = await openReportId(reporter, target, clusterId)

    const { data: noteId, error } = await modA.client.rpc('add_moderation_case_note', {
      p_report_id: reportId,
      p_note: 'Looks like a heated thread, watching.',
    })
    expect(error).toBeNull()

    const { error: editErr } = await modB.client.rpc('edit_moderation_case_note', {
      p_note_id: noteId,
      p_note: 'rewrite',
    })
    expect(editErr?.message).toContain('insufficient_permission')

    const { error: ownEditErr } = await modA.client.rpc('edit_moderation_case_note', {
      p_note_id: noteId,
      p_note: 'Looks like a heated thread, still watching.',
    })
    expect(ownEditErr).toBeNull()

    const { data: timeline, error: tlErr } = await modA.client.rpc('get_moderation_case_timeline', {
      p_report_id: reportId,
    })
    expect(tlErr).toBeNull()
    const kinds = (timeline as { kind: string; body: string }[]).map((e) => e.kind)
    expect(kinds).toContain('note')
    const note = (timeline as { kind: string; body: string }[]).find((e) => e.kind === 'note')
    expect(note?.body).toContain('still watching')

    const { error: delErr } = await modA.client.rpc('delete_moderation_case_note', { p_note_id: noteId })
    expect(delErr).toBeNull()
    const { data: after } = await modA.client.rpc('get_moderation_case_timeline', { p_report_id: reportId })
    expect((after as { kind: string }[]).filter((e) => e.kind === 'note')).toHaveLength(0)
  })

  it('assignment is admin-only and escalation bumps severity', async () => {
    const reporter = await member('cw-rep4')
    const target = await member('cw-tgt4')
    const mod = await moderator('cw-mod4')
    const other = await moderator('cw-mod5')
    const adm = await administrator('cw-adm4')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)
    const reportId = await openReportId(reporter, target, clusterId)

    const { error: modAssignErr } = await mod.client.rpc('assign_moderation_case', {
      p_report_id: reportId,
      p_assignee: other.id,
      p_reason: 'load balancing',
    })
    expect(modAssignErr?.message).toContain('insufficient_permission')

    const { error: assignErr } = await adm.client.rpc('assign_moderation_case', {
      p_report_id: reportId,
      p_assignee: mod.id,
      p_reason: 'load balancing',
    })
    expect(assignErr).toBeNull()

    const { error: strangerEscErr } = await other.client.rpc('escalate_moderation_case', {
      p_report_id: reportId,
      p_reason: 'not mine',
    })
    expect(strangerEscErr?.message).toContain('cannot_escalate_not_assigned_to_you')

    const { error: escErr } = await mod.client.rpc('escalate_moderation_case', {
      p_report_id: reportId,
      p_reason: 'target has prior actions',
    })
    expect(escErr).toBeNull()

    const { data } = await adm.client.rpc('get_moderation_case_v2', { p_report_id: reportId })
    const row = (data as unknown[])[0] as { escalated_at: string; severity: string }
    expect(row.escalated_at).not.toBeNull()
    expect(row.severity).toBe('high')

    const { data: timeline } = await adm.client.rpc('get_moderation_case_timeline', { p_report_id: reportId })
    const actions = (timeline as { kind: string; action: string }[])
      .filter((e) => e.kind === 'action')
      .map((e) => e.action)
    expect(actions).toContain('case_assigned')
    expect(actions).toContain('case_escalated')
  })

  it('severity changes are guarded and audited', async () => {
    const reporter = await member('cw-rep5')
    const target = await member('cw-tgt5')
    const mod = await moderator('cw-mod6')
    const other = await moderator('cw-mod7')
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)
    const reportId = await openReportId(reporter, target, clusterId)

    await mod.client.rpc('claim_moderation_report', { p_report_id: reportId })
    const { error: otherErr } = await other.client.rpc('set_moderation_case_severity', {
      p_report_id: reportId,
      p_severity: 'urgent',
      p_reason: 'hijack',
    })
    expect(otherErr?.message).toContain('cannot_retriage_not_assigned_to_you')

    const { error } = await mod.client.rpc('set_moderation_case_severity', {
      p_report_id: reportId,
      p_severity: 'urgent',
      p_reason: 'credible threat language',
    })
    expect(error).toBeNull()

    const { data } = await mod.client.rpc('get_moderation_case_v2', { p_report_id: reportId })
    const row = (data as unknown[])[0] as { severity: string; priority_score: number }
    expect(row.severity).toBe('urgent')
    expect(row.priority_score).toBe(100)
  })
})
