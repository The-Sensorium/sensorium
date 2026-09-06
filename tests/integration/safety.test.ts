import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adminClient, createCluster, createUser, onboardUser, cleanup } from './helpers'

const DOB = '1992-03-14'

describe('safety: mutes + my reports', () => {
  const admin = adminClient()
  const userIds: string[] = []
  const clusterIds: string[] = []

  beforeEach(() => {
    userIds.length = 0
    clusterIds.length = 0
  })

  afterEach(async () => {
    await admin.from('user_mutes').delete().in('user_id', userIds)
    await cleanup(admin, clusterIds, userIds)
  })

  it('mute RLS is scoped to the owner and rejects self-mute', async () => {
    const a = await createUser(admin, 's-mute-a')
    const b = await createUser(admin, 's-mute-b')
    userIds.push(a.id, b.id)
    await onboardUser(admin, a.id, { dob: DOB })
    await onboardUser(admin, b.id, { dob: DOB })

    const { error: insertErr } = await a.client
      .from('user_mutes')
      .insert({ user_id: a.id, muted_user_id: b.id })
    expect(insertErr).toBeNull()

    const { data: mine } = await a.client.from('user_mutes').select('muted_user_id')
    expect(mine?.map((r) => r.muted_user_id)).toEqual([b.id])

    const { data: named, error: namedErr } = await a.client.rpc('get_my_mutes')
    expect(namedErr).toBeNull()
    expect(named).toHaveLength(1)
    expect(named![0].muted_user_id).toBe(b.id)
    expect(named![0].display_name).toBe('Integration User')

    const { data: theirs } = await b.client.from('user_mutes').select('muted_user_id')
    expect(theirs ?? []).toEqual([])

    const { error: selfErr } = await a.client
      .from('user_mutes')
      .insert({ user_id: a.id, muted_user_id: a.id })
    expect(selfErr?.message).toContain('user_mutes_no_self')

    const { error: deleteErr } = await a.client.from('user_mutes').delete().eq('muted_user_id', b.id)
    expect(deleteErr).toBeNull()
  })

  it('get_my_reports_v2 shows the reporter their rows with kind + cluster', async () => {
    const reporter = await createUser(admin, 's-rep')
    const target = await createUser(admin, 's-tgt')
    userIds.push(reporter.id, target.id)
    await onboardUser(admin, reporter.id, { dob: DOB })
    await onboardUser(admin, target.id, { dob: DOB })
    const clusterId = await createCluster(admin, { memberIds: [reporter.id, target.id] })
    clusterIds.push(clusterId)

    const { error: reportErr } = await reporter.client.rpc('report_member', {
      p_cluster_id: clusterId,
      p_target_user_id: target.id,
      p_reason: 'spam',
    })
    expect(reportErr).toBeNull()

    const { data: mine, error: mineErr } = await reporter.client.rpc('get_my_reports_v2')
    expect(mineErr).toBeNull()
    expect(mine).toHaveLength(1)
    expect(mine![0].cluster_id).toBe(clusterId)
    expect(mine![0].target_kind).toBe('member')
    expect(mine![0].target_display_name).toBe('Integration User')

    const { data: empty } = await target.client.rpc('get_my_reports_v2')
    expect(empty ?? []).toEqual([])
  })
})
