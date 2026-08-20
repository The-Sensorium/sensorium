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

// Email outbox: every enforcement path enqueues the right template/recipient,
// claim/mark drive the Edge Function lifecycle, failures abandon, and the
// recovery sweep re-queues stuck rows. No real email is ever sent; we assert on
// the outbound_emails rows.

type OutboxRow = {
  id: string
  user_id: string | null
  recipient_email: string
  template: string
  params: Record<string, unknown>
  status: string
  attempts: number
  last_error: string | null
  sent_at: string | null
}

async function outbox(admin: ReturnType<typeof adminClient>): Promise<OutboxRow[]> {
  const { data, error } = await admin.from('outbound_emails').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as OutboxRow[]
}

describe('email outbox lifecycle', () => {
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
    await onboardUser(admin, u.id, { dob: '1995-06-01' })
    return u
  }

  it('claim moves queued->sending, mark completes a send', async () => {
    const a = await member('em-a')
    const b = await member('em-b')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'harassment',
    })

    const queued = await outbox(admin)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.template).toBe('report-received')
    expect(queued[0]!.recipient_email).toBe(a.email)
    expect(queued[0]!.status).toBe('queued')
    expect(queued[0]!.user_id).toBe(a.id)

    const { data: claimed, error: claimErr } = await admin.rpc('claim_outbound_emails', { p_limit: 20 })
    expect(claimErr).toBeNull()
    expect(claimed).toHaveLength(1)
    expect(claimed![0].id).toBe(queued[0]!.id)
    expect(claimed![0].template).toBe('report-received')
    expect(claimed![0].recipient_email).toBe(a.email)

    const { error: markErr } = await admin.rpc('mark_outbound_email', {
      p_id: queued[0]!.id,
      p_status: 'sent',
    })
    expect(markErr).toBeNull()
    const sent = await outbox(admin)
    expect(sent[0]!.status).toBe('sent')
    expect(sent[0]!.attempts).toBe(1)
    expect(sent[0]!.sent_at).not.toBeNull()
  })

  it('mark failed retries and abandons after five attempts', async () => {
    const a = await member('em-fail-a')
    const b = await member('em-fail-b')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'spam',
    })
    const [{ id }] = await outbox(admin)

    for (let i = 0; i < 5; i++) {
      const { error } = await admin.rpc('mark_outbound_email', { p_id: id, p_status: 'failed', p_error: 'boom' })
      expect(error).toBeNull()
    }
    const failed = await outbox(admin)
    expect(failed[0]!.status).toBe('abandoned')
    expect(failed[0]!.attempts).toBe(5)
    expect(failed[0]!.last_error).toBe('boom')
  })

  it('mark rejects invalid statuses', async () => {
    const a = await member('em-inv-a')
    const b = await member('em-inv-b')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'spam',
    })
    const [{ id }] = await outbox(admin)
    const { error } = await admin.rpc('mark_outbound_email', { p_id: id, p_status: 'nonsense' })
    expect(error?.message).toContain('invalid_email_status')
  })

  it('recover_stuck_sending requeues rows stuck in sending', async () => {
    const a = await member('em-stuck-a')
    const b = await member('em-stuck-b')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    await a.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: b.id,
      p_reason: 'spam',
    })
    const [{ id }] = await outbox(admin)

    // Simulate a crash mid-send: claim, then age the row 3 minutes.
    await admin.rpc('claim_outbound_emails', { p_limit: 20 })
    const { error: ageErr } = await admin
      .from('outbound_emails')
      .update({ updated_at: new Date(Date.now() - 3 * 60_000).toISOString() })
      .eq('id', id)
    expect(ageErr).toBeNull()

    const { error: recErr } = await admin.rpc('recover_stuck_sending')
    expect(recErr).toBeNull()
    const restored = await outbox(admin)
    expect(restored[0]!.status).toBe('queued')
  })
})

describe('email enqueue on enforcement paths', () => {
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
    await onboardUser(admin, u.id, { dob: '1995-06-01' })
    return u
  }

  async function moderator(prefix: string): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await assignPlatformRole(admin, u.id, 'moderator')
    return u
  }

  async function openReport(reporter: TestUser, target: TestUser, clusterId: string): Promise<string> {
    const { data, error } = await reporter.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'harassment',
    })
    if (error) throw error
    return data as string
  }

  it('report-received goes to the reporter, report-resolved to the reporter on dismissal', async () => {
    const a = await member('enq-a')
    const b = await member('enq-b')
    const mod = await moderator('enq-mod')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const reportId = await openReport(a, b, clusterId)
    let rows = await outbox(admin)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.template).toBe('report-received')
    expect(rows[0]!.recipient_email).toBe(a.email)
    expect(rows[0]!.params.reason).toBe('harassment')

    await mod.client.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'dismissed',
      p_note: 'no action',
    })
    rows = await outbox(admin)
    expect(rows.map((r) => r.template)).toEqual(['report-received', 'report-resolved'])
    expect(rows[1]!.recipient_email).toBe(a.email)
    expect(rows[1]!.params.outcome).toBe('dismissed')
  })

  it('report-resolved sends actioned when actioned, never to the acting moderator', async () => {
    const a = await member('enq-act-a')
    const b = await member('enq-act-b')
    const mod = await moderator('enq-act-mod')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const reportId = await openReport(a, b, clusterId)
    await mod.client.rpc('issue_warning', { p_user_id: b.id, p_reason: 'warning for spam', p_report_id: reportId })

    const rows = await outbox(admin)
    expect(rows.map((r) => r.template)).toEqual(['report-received', 'warning-issued', 'report-resolved'])
    expect(rows.find((r) => r.template === 'report-resolved')!.recipient_email).toBe(a.email)
    expect(rows.find((r) => r.template === 'warning-issued')!.recipient_email).toBe(b.email)
    // No email to the moderator who acted.
    expect(rows.every((r) => r.recipient_email !== mod.email)).toBe(true)
  })

  it('hide_message emails the author, not the moderator', async () => {
    const a = await member('enq-hide-a')
    const b = await member('enq-hide-b')
    const mod = await moderator('enq-hide-mod')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const { data: messageId } = await a.client.rpc('send_message', {
      p_cluster_id: clusterId,
      p_content: 'an offending message',
    })
    const { data: reportId } = await b.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: a.id,
      p_reason: 'harassment',
      p_message_id: messageId as string,
    })

    await mod.client.rpc('hide_message', {
      p_message_id: messageId as string,
      p_reason: 'inappropriate',
      p_report_id: reportId as string,
    })

    const rows = await outbox(admin)
    const hidden = rows.find((r) => r.template === 'message-hidden')!
    expect(hidden.recipient_email).toBe(a.email)
    expect(hidden.user_id).toBe(a.id)
    expect(rows.every((r) => r.recipient_email !== mod.email)).toBe(true)
  })

  it('suspension, ban, and lift enqueue the right templates', async () => {
    const a = await member('enq-sus-a')
    const adm = await moderator('enq-sus-adm')
    await assignPlatformRole(admin, adm.id, 'admin')

    const expiresAt = new Date(Date.now() + 2 * 86_400_000).toISOString()
    await adm.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'suspended',
      p_reason: 'suspension reason',
      p_expires_at: expiresAt,
    })
    let rows = await outbox(admin)
    expect(rows.map((r) => r.template)).toEqual(['account-suspended'])
    expect(rows[0]!.recipient_email).toBe(a.email)
    expect(rows[0]!.params.reason ?? rows[0]!.params.appeal_url).toBeTruthy()
    expect(rows[0]!.params.appeal_url).toContain('/appeal')

    await adm.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'active',
      p_reason: 'reviewed, restoring access',
    })
    rows = await outbox(admin)
    expect(rows.map((r) => r.template)).toEqual(['account-suspended', 'restriction-lifted'])
    expect(rows[1]!.recipient_email).toBe(a.email)

    await adm.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'banned',
      p_reason: 'permanent reason',
    })
    rows = await outbox(admin)
    expect(rows.map((r) => r.template)).toEqual(['account-suspended', 'restriction-lifted', 'account-banned'])
    expect(rows[2]!.params.appeal_url).toContain('/appeal')
  })

  it('lift_expired_suspensions emails the auto-lifted user', async () => {
    const a = await member('enq-autolift-a')
    const adm = await moderator('enq-autolift-adm')
    await assignPlatformRole(admin, adm.id, 'admin')

    // Suspension already expired.
    await adm.client.rpc('apply_account_restriction', {
      p_user_id: a.id,
      p_status: 'suspended',
      p_reason: 'short suspension',
      p_expires_at: new Date(Date.now() - 60_000).toISOString(),
    })
    const before = await outbox(admin)
    expect(before.map((r) => r.template)).toEqual(['account-suspended'])

    await admin.rpc('lift_expired_suspensions')
    const after = await outbox(admin)
    expect(after.map((r) => r.template)).toEqual(['account-suspended', 'restriction-lifted'])
    expect(after[1]!.recipient_email).toBe(a.email)
  })

  it('no email is enqueued for a report whose reporter profile is gone', async () => {
    const a = await member('enq-del-a')
    const b = await member('enq-del-b')
    const clusterId = await createCluster(admin, { memberIds: [a.id, b.id], status: 'active' })
    clusterIds.push(clusterId)

    const reportId = await openReport(a, b, clusterId)

    // Remove the reporter's profile entirely (as account deletion does). The
    // outbox FK (on delete set null) and the enqueue_email profile lookup both
    // yield nothing, so no report-resolved row is written.
    const { error: delErr } = await admin.auth.admin.deleteUser(a.id)
    expect(delErr).toBeNull()
    await admin.rpc('resolve_moderation_report', {
      p_report_id: reportId,
      p_status: 'dismissed',
      p_note: 'nothing to see',
    })

    // report-received already queued at report time; report-resolved must be
    // silently skipped (missing profile short-circuits in enqueue_email).
    const rows = await outbox(admin)
    expect(rows.map((r) => r.template)).toEqual(['report-received'])
  })
})