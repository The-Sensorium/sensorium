import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adminClient,
  anonClient,
  assignPlatformRole,
  cleanup,
  createUser,
  type TestUser,
} from './helpers'

// Opt-in staff MFA enforcement (0157): enrolled staff must present AAL2,
// unenrolled staff keep working at AAL1, members are unaffected.

const admin = adminClient()
const userIds: string[] = []

function totp(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secret.replace(/\s+/g, '').toUpperCase()) {
    const v = alphabet.indexOf(c)
    if (v < 0) throw new Error(`bad base32 char: ${c}`)
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', Buffer.from(bytes)).update(msg).digest()
  const o = digest[digest.length - 1] & 0x0f
  const code = ((digest[o] & 0x7f) << 24) | (digest[o + 1] << 16) | (digest[o + 2] << 8) | digest[o + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

async function moderator(prefix: string): Promise<TestUser> {
  const u = await createUser(admin, prefix)
  userIds.push(u.id)
  await assignPlatformRole(admin, u.id, 'moderator')
  return u
}

async function freshSession(email: string, password: string): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

async function enrollTotp(client: SupabaseClient): Promise<{ factorId: string; secret: string }> {
  const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp' })
  if (error) throw error
  return { factorId: data.id, secret: data.totp.secret }
}

async function verifyCode(client: SupabaseClient, factorId: string, secret: string): Promise<void> {
  // The 30s window can roll over mid-attempt; retry with a fresh code.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId })
    if (challengeError) throw challengeError
    const { error } = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: totp(secret),
    })
    if (!error) return
  }
  throw new Error('TOTP verification never succeeded')
}

beforeEach(() => {
  userIds.length = 0
})

afterEach(async () => {
  await cleanup(admin, [], userIds)
})

describe('opt-in staff MFA enforcement', () => {
  it('unenrolled staff keep working at AAL1', async () => {
    const m = await moderator('mfa-plain')
    const { error } = await m.client.rpc('get_moderation_queue')
    expect(error).toBeNull()
  })

  it('enrolled staff are denied at AAL1 and allowed at AAL2', async () => {
    const m = await moderator('mfa-enrolled')
    const { factorId, secret } = await enrollTotp(m.client)
    await verifyCode(m.client, factorId, secret)

    const aal1 = await freshSession(m.email, m.password)
    const { error: denied } = await aal1.rpc('get_moderation_queue')
    expect(denied?.message).toContain('staff_mfa_required')

    await verifyCode(aal1, factorId, secret)
    const { error: allowed } = await aal1.rpc('get_moderation_queue')
    expect(allowed).toBeNull()
  })
})
