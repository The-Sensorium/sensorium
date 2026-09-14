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

async function suspendedAppeal(target: TestUser, adm: TestUser): Promise<string> {
  const { error: suspErr } = await adm.client.rpc('apply_account_restriction', {
    p_user_id: target.id,
    p_status: 'suspended',
    p_reason: 'spam wave',
    p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  })
  if (suspErr) throw suspErr
  const { data, error } = await target.client.rpc('submit_appeal', {
    p_details: 'I did not spam, please reconsider.',
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

describe('appeals v2 (phase 6)', () => {
  it('moderators cannot touch appeal staff RPCs', async () => {
    const target = await member('av-tgt')
    const mod = await moderator('av-mod')
    const adm = await administrator('av-adm')
    const clusterId = await createCluster(admin, { memberIds: [target.id] })
    clusterIds.push(clusterId)
    const appealId = await suspendedAppeal(target, adm)

    for (const [rpc, args] of [
      ['claim_appeal', { p_appeal_id: appealId }],
      ['list_appeals_page_v2', { p_filters: {} }],
      ['get_admin_appeal_v2', { p_appeal_id: appealId }],
    ] as const) {
      const { error } = await mod.client.rpc(rpc, args)
      expect(error?.message).toContain('insufficient_permission')
    }
  })

  it('claim, assign, and notes flow with timeline visibility', async () => {
    const target = await member('av-tgt2')
    const admA = await administrator('av-admA')
    const admB = await administrator('av-admB')
    const clusterId = await createCluster(admin, { memberIds: [target.id] })
    clusterIds.push(clusterId)
    const appealId = await suspendedAppeal(target, admA)

    const { error: claimErr } = await admA.client.rpc('claim_appeal', { p_appeal_id: appealId })
    expect(claimErr).toBeNull()

    const { error: doubleClaim } = await admB.client.rpc('claim_appeal', { p_appeal_id: appealId })
    expect(doubleClaim?.message).toContain('cannot_claim_appeal')

    const { error: assignErr } = await admA.client.rpc('assign_appeal', {
      p_appeal_id: appealId,
      p_assignee: admB.id,
      p_reason: 'load balancing',
    })
    expect(assignErr).toBeNull()

    const { error: noteErr } = await admB.client.rpc('add_appeal_note', {
      p_appeal_id: appealId,
      p_note: 'Looks genuine, checking history.',
    })
    expect(noteErr).toBeNull()

    const { data: detail } = await admB.client.rpc('get_admin_appeal_v2', { p_appeal_id: appealId })
    const row = (detail as unknown[])[0] as {
      assigned_to: string
      internal_note: string
      review_due_at: string
      original_report_id: string | null
      appellant: { account_status: string; prior_reports: number }
    }
    expect(row.assigned_to).toBe(admB.id)
    expect(row.internal_note).toContain('genuine')
    expect(row.review_due_at).not.toBeNull()
    expect(row.appellant.account_status).toBe('suspended')
  })

  it('queue v2 filters by assignee and overdue', async () => {
    const target = await member('av-tgt3')
    const adm = await administrator('av-admC')
    const clusterId = await createCluster(admin, { memberIds: [target.id] })
    clusterIds.push(clusterId)
    const appealId = await suspendedAppeal(target, adm)

    const { data: open } = await adm.client.rpc('list_appeals_page_v2', {
      p_filters: { sla: 'open' },
      p_limit: 10,
    })
    expect((open as { id: string }[]).some((r) => r.id === appealId)).toBe(true)

    const { data: mine } = await adm.client.rpc('list_appeals_page_v2', {
      p_filters: { assignee: 'mine' },
      p_limit: 10,
    })
    expect((mine as unknown[]).length).toBe(0)

    await adm.client.rpc('claim_appeal', { p_appeal_id: appealId })
    const { data: mineAfter } = await adm.client.rpc('list_appeals_page_v2', {
      p_filters: { assignee: 'mine' },
      p_limit: 10,
    })
    expect((mineAfter as { id: string }[]).some((r) => r.id === appealId)).toBe(true)
  })

  it('rejecting a ban appeal needs a different admin second review', async () => {
    const target = await member('av-tgt4')
    const admA = await administrator('av-admD')
    const admB = await administrator('av-admE')
    const clusterId = await createCluster(admin, { memberIds: [target.id] })
    clusterIds.push(clusterId)

    const { error: banErr } = await admA.client.rpc('apply_account_restriction', {
      p_user_id: target.id,
      p_status: 'banned',
      p_reason: 'hate speech',
    })
    expect(banErr).toBeNull()
    const { data: appealId, error: appealErr } = await target.client.rpc('submit_appeal', {
      p_details: 'I am sorry, please give me another chance.',
    })
    expect(appealErr).toBeNull()

    const { error: directReject } = await admA.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: false,
      p_response: 'Ban stands.',
    })
    expect(directReject?.message).toContain('second_review_required')

    const { error: reqErr } = await admA.client.rpc('request_appeal_second_review', {
      p_appeal_id: appealId,
    })
    expect(reqErr).toBeNull()

    const { error: selfReject } = await admA.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: false,
      p_response: 'Ban stands.',
      p_second_review_confirmed: true,
    })
    expect(selfReject?.message).toContain('second_review_required')

    const { error: otherReject } = await admB.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: false,
      p_response: 'Ban stands after second review.',
      p_decision_reason_code: 'hate_speech',
      p_second_review_confirmed: true,
    })
    expect(otherReject).toBeNull()

    const { data: detail } = await admB.client.rpc('get_admin_appeal_v2', { p_appeal_id: appealId })
    const row = (detail as unknown[])[0] as { status: string; decision_reason_code: string }
    expect(row.status).toBe('resolved')
    expect(row.decision_reason_code).toBe('hate_speech')
  })

  it('suspension appeals resolve without second review and grant lifts', async () => {
    const target = await member('av-tgt5')
    const adm = await administrator('av-admF')
    const clusterId = await createCluster(admin, { memberIds: [target.id] })
    clusterIds.push(clusterId)
    const appealId = await suspendedAppeal(target, adm)

    const { error } = await adm.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: true,
      p_response: 'You were right, welcome back.',
      p_internal_note: 'First offense, genuine appeal.',
    })
    expect(error).toBeNull()

    const { data: detail } = await adm.client.rpc('get_admin_appeal_v2', { p_appeal_id: appealId })
    const row = (detail as unknown[])[0] as { status: string; internal_note: string }
    expect(row.status).toBe('resolved')
    expect(row.internal_note).toContain('First offense')
  })
})
