import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adminClient,
  assignPlatformRole,
  cleanup,
  createUser,
  onboardUser,
  type TestUser,
} from './helpers'

// Appeals: submit/get/list/decide across the member and admin sides, the
// one-open-per-user rule, lapsed-suspension handling, and appeal emails in the
// outbox.

type MyAppealRow = {
  id: string
  appealed_status: string
  appealed_reason: string
  appealed_expires_at: string | null
  details: string
  status: string
  response: string | null
  created_at: string
  decided_at: string | null
}

type OutboxRow = {
  id: string
  user_id: string | null
  recipient_email: string
  template: string
  params: Record<string, unknown>
  status: string
}

async function outbox(admin: ReturnType<typeof adminClient>): Promise<OutboxRow[]> {
  const { data, error } = await admin.from('outbound_emails').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as OutboxRow[]
}

describe('appeals', () => {
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

  async function administrator(prefix: string): Promise<TestUser> {
    const u = await createUser(admin, prefix)
    userIds.push(u.id)
    await assignPlatformRole(admin, u.id, 'admin')
    return u
  }

  async function suspend(u: TestUser, reason = 'integration suspension', ms = 2 * 86_400_000) {
    const adm = await administrator('ap-admin')
    userIds.push(adm.id)
    const { error } = await adm.client.rpc('apply_account_restriction', {
      p_user_id: u.id,
      p_status: 'suspended',
      p_reason: reason,
      p_expires_at: new Date(Date.now() + ms).toISOString(),
    })
    expect(error).toBeNull()
    return adm
  }

  it('rejects an appeal from an active account', async () => {
    const a = await member('ap-active')

    const { error } = await a.client.rpc('submit_appeal', { p_details: 'please unblock' })
    expect(error?.message).toContain('account_not_restricted')
  })

  it('accepts an appeal from a suspended account and enqueues appeal-received', async () => {
    const a = await member('ap-sus')
    await suspend(a)

    const { data: appealId, error } = await a.client.rpc('submit_appeal', { p_details: 'I was wrongly suspended.' })
    expect(error).toBeNull()
    expect(appealId).toBeTruthy()

    const emails = await outbox(admin)
    const received = emails.find((e) => e.template === 'appeal-received')!
    expect(received.recipient_email).toBe(a.email)
    expect(received.params.appeal_url).toContain('/appeal')

    const { data: mine, error: mineErr } = await a.client.rpc('get_my_appeal')
    expect(mineErr).toBeNull()
    const rows = (mine ?? []) as MyAppealRow[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('submitted')
    expect(rows[0]!.appealed_status).toBe('suspended')
    expect(rows[0]!.appealed_reason).toBe('integration suspension')
    expect(rows[0]!.details).toBe('I was wrongly suspended.')
  })

  it('enforces one open appeal per user', async () => {
    const a = await member('ap-one')
    await suspend(a)

    await a.client.rpc('submit_appeal', { p_details: 'first appeal' })
    const { error } = await a.client.rpc('submit_appeal', { p_details: 'second appeal' })
    expect(error).not.toBeNull()

    const { data } = await a.client.rpc('get_my_appeal')
    expect((data ?? []) as MyAppealRow[]).toHaveLength(1)
  })

  it('rejects an appeal when the restriction has lapsed', async () => {
    const a = await member('ap-lapsed')
    await suspend(a, 'short suspension', -60_000) // already expired

    const { error } = await a.client.rpc('submit_appeal', { p_details: 'too late' })
    expect(error?.message).toContain('account_not_restricted')
  })

  it('rejects appeals with no details or overlong details', async () => {
    const a = await member('ap-details')
    await suspend(a)

    const { error: emptyErr } = await a.client.rpc('submit_appeal', { p_details: '' })
    expect(emptyErr?.message).toContain('details_required')

    const { error: longErr } = await a.client.rpc('submit_appeal', { p_details: 'x'.repeat(5001) })
    expect(longErr?.message).toContain('details_too_long')
  })

  it('denies members (and moderators) the admin appeal reads', async () => {
    const a = await member('ap-deny-member')
    const mod = await createUser(admin, 'ap-deny-mod')
    userIds.push(mod.id)
    await assignPlatformRole(admin, mod.id, 'moderator')

    // The queue reads are SQL + WHERE can_manage_roles (like get_moderation_queue):
    // non-admins get empty rows, not rows. decide_appeal raises instead.
    const { data: listData, error: listErr } = await a.client.rpc('list_appeals_page')
    expect(listErr).toBeNull()
    expect(listData).toEqual([])
    const { data: modListData, error: modListErr } = await mod.client.rpc('list_appeals_page')
    expect(modListErr).toBeNull()
    expect(modListData).toEqual([])
    const { data: getData, error: getErr } = await a.client.rpc('get_admin_appeal', {
      p_appeal_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(getErr).toBeNull()
    expect(getData).toEqual([])

    const { error: decideErr } = await a.client.rpc('decide_appeal', {
      p_appeal_id: '00000000-0000-0000-0000-000000000000',
      p_accept: true,
      p_response: 'should not matter',
    })
    expect(decideErr?.message).toContain('insufficient_permission')
  })

  it('decide_appeal accept lifts the restriction and emails appeal-resolved', async () => {
    const a = await member('ap-accept')
    const adm = await suspend(a)

    const { data: appealId } = await a.client.rpc('submit_appeal', { p_details: 'Please restore me.' })

    const { data: listed, error: listErr } = await adm.client.rpc('list_appeals_page')
    expect(listErr).toBeNull()
    expect((listed ?? []).some((r: { id: string }) => r.id === appealId)).toBe(true)

    const { data: detail, error: detailErr } = await adm.client.rpc('get_admin_appeal', { p_appeal_id: appealId })
    expect(detailErr).toBeNull()
    expect((detail ?? [])[0].current_account_status).toBe('suspended')

    const { error: decideErr } = await adm.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: true,
      p_response: 'We reviewed your case and are restoring access.',
    })
    expect(decideErr).toBeNull()

    const { data: after } = await a.client.rpc('get_my_appeal')
    expect(after![0].status).toBe('resolved')
    expect(after![0].response).toBe('We reviewed your case and are restoring access.')

    const { data: me } = await a.client.rpc('get_my_access')
    expect(me![0].account_status).toBe('active')

    const emails = await outbox(admin)
    const resolved = emails.find((e) => e.template === 'appeal-resolved')!
    expect(resolved.recipient_email).toBe(a.email)
    expect(resolved.params.accepted).toBe(true)
  })

  it('decide_appeal reject keeps the restriction and emails the appellant', async () => {
    const a = await member('ap-reject')
    const adm = await suspend(a)

    const { data: appealId } = await a.client.rpc('submit_appeal', { p_details: 'I disagree.' })
    const { error } = await adm.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: false,
      p_response: 'The suspension stands after review.',
    })
    expect(error).toBeNull()

    const { data: me } = await a.client.rpc('get_my_access')
    expect(me![0].account_status).toBe('suspended')

    const emails = await outbox(admin)
    const resolved = emails.find((e) => e.template === 'appeal-resolved')!
    expect(resolved.params.accepted).toBe(false)
  })

  it('decide_appeal requires a response and cannot be repeated', async () => {
    const a = await member('ap-guard')
    const adm = await suspend(a)

    const { data: appealId } = await a.client.rpc('submit_appeal', { p_details: 'again' })

    const { error: emptyErr } = await adm.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: true,
      p_response: '',
    })
    expect(emptyErr?.message).toContain('response_required')

    // The response doubles as the restriction lift reason (capped at 2000), so
    // over-long responses are rejected before any lift could half-apply.
    const { error: longErr } = await adm.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: true,
      p_response: 'x'.repeat(2001),
    })
    expect(longErr?.message).toContain('response_too_long')

    const { error: okErr } = await adm.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: true,
      p_response: 'granted',
    })
    expect(okErr).toBeNull()

    const { error: againErr } = await adm.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: true,
      p_response: 'double decide',
    })
    expect(againErr?.message).toContain('appeal_already_resolved')
  })

  it('accepting an appeal after the suspension already auto-lifted resolves cleanly', async () => {
    const a = await member('ap-autolift')
    const adm = await suspend(a, 'short suspension', 60_000)
    const { data: appealId } = await a.client.rpc('submit_appeal', { p_details: 'fix this' })

    // The suspension lapses while the appeal is open; the next decision must
    // resolve cleanly even though apply_account_restriction hits the lid.
    const { error: ageErr } = await admin
      .from('account_restrictions')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('user_id', a.id)
    expect(ageErr).toBeNull()
    await admin.rpc('lift_expired_suspensions')
    const { data: me } = await a.client.rpc('get_my_access')
    expect(me![0].account_status).toBe('active')

    const { error } = await adm.client.rpc('decide_appeal', {
      p_appeal_id: appealId,
      p_accept: true,
      p_response: 'granted after review',
    })
    expect(error).toBeNull()

    const { data: after } = await a.client.rpc('get_my_appeal')
    expect(after![0].status).toBe('resolved')
    expect(after![0].response).toBe('granted after review')
  })
})