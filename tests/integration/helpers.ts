import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Integration tests exercise the real local Supabase stack (PostgREST + RLS +
// security definer RPC functions) the same way the app does. They require the
// stack to be running (`supabase start`). Override endpoints via env vars:
//   INTEGRATION_SUPABASE_URL / INTEGRATION_ANON_KEY / INTEGRATION_SERVICE_ROLE_KEY

const TEST_PASSWORD = 'integration-pass-123'

interface StackConfig {
  url: string
  anonKey: string
  serviceRole: string
}
let config: StackConfig | null = null

function stackStatus(): Record<string, string> {
  try {
    return JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }))
  } catch {
    throw new Error('Supabase stack is not running. Run `supabase start` first.')
  }
}

export function resolveConfig(): StackConfig {
  if (config) return config
  const s = stackStatus()
  config = {
    url: process.env.INTEGRATION_SUPABASE_URL ?? s.API_URL,
    anonKey:
      process.env.INTEGRATION_ANON_KEY ?? s.PUBLISHABLE_KEY ?? s.ANON_KEY,
    serviceRole: process.env.INTEGRATION_SERVICE_ROLE_KEY ?? s.SERVICE_ROLE_KEY,
  }
  if (!config.url || !config.anonKey || !config.serviceRole) {
    throw new Error(
      'Could not resolve Supabase URL / anon / service_role for integration tests.',
    )
  }
  return config
}

/** Service-role client (bypasses RLS) used for fixture setup and cleanup. */
export function adminClient(): SupabaseClient {
  const { url, serviceRole } = resolveConfig()
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Unauthenticated (anon) client used to probe what is visible without a session. */
export function anonClient(): SupabaseClient {
  const { url, anonKey } = resolveConfig()
  return createClient(url, anonKey, { auth: { persistSession: false } })
}

export interface TestUser {
  id: string
  email: string
  password: string
  client: SupabaseClient
}

/**
 * Creates an auth user (profile auto-created by the trigger), signs in as them,
 * and returns an authenticated client plus the user id.
 */
export async function createUser(
  admin: SupabaseClient,
  prefix: string,
): Promise<TestUser> {
  const email = `${prefix}-${randomUUID().slice(0, 8)}@integration.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error) throw error
  const id = data.user!.id
  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (signInError) throw signInError
  return { id, email, password: TEST_PASSWORD, client }
}

/** Completes onboarding for a user (profile fields required by matching). */
export async function onboardUser(
  admin: SupabaseClient,
  id: string,
  opts: {
    dob: string
    countryCode?: string
    localArea?: string
    localRadiusKm?: number
    displayName?: string
  },
): Promise<void> {
  const { error } = await admin
    .from('profiles')
    .update({
      display_name: opts.displayName ?? 'Integration User',
      dob: opts.dob,
      country_code: opts.countryCode ?? null,
      local_area: opts.localArea ?? null,
      local_radius_km: opts.localRadiusKm ?? null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export interface ClusterOptions {
  memberIds: string[]
  name?: string
  mode?: string
  modeLabel?: string
  queueKey?: string
  status?: 'introductions' | 'active'
  introductionsDeadline?: string | null
}

/** Creates a cluster and its memberships directly (bypasses RLS). Returns id. */
export async function createCluster(
  admin: SupabaseClient,
  opts: ClusterOptions,
): Promise<string> {
  const active = (opts.status ?? 'active') === 'active'
  const { data, error } = await admin
    .from('clusters')
    .insert({
      name: opts.name ?? 'Test Cluster',
      matching_mode: opts.mode ?? 'exact_birthdate',
      mode_label: opts.modeLabel ?? 'Test Mode',
      queue_key: opts.queueKey ?? '2000-01-01',
      status: opts.status ?? 'active',
      introductions_completed_at: active ? new Date().toISOString() : null,
      introductions_deadline: opts.introductionsDeadline ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  const clusterId = data.id
  const { error: mErr } = await admin.from('cluster_members').insert(
    opts.memberIds.map((userId) => ({
      cluster_id: clusterId,
      user_id: userId,
    })),
  )
  if (mErr) throw mErr
  return clusterId
}

/**
 * Best-effort cleanup: reports reference clusters and profiles (no cascade), so
 * remove them first, then clusters (cascades votes, rounds, invitations,
 * memberships), then users. Tolerates already-deleted rows.
 */
export async function cleanup(
  admin: SupabaseClient,
  clusterIds: string[],
  userIds: string[],
): Promise<void> {
  if (userIds.length) {
    await admin
      .from('reports')
      .delete()
      .or(`reporter_id.in.(${userIds.join(',')}),target_user_id.in.(${userIds.join(',')})`)
  }
  if (clusterIds.length) {
    const { error } = await admin.from('clusters').delete().in('id', clusterIds)
    if (error) {
      throw new Error(`cleanup clusters: ${error.message}`)
    }
  }
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error && !error.message.includes('not found')) {
      throw new Error(`cleanup user ${id}: ${error.message}`)
    }
  }
}

/** A tiny valid 1x1 PNG for storage upload tests. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/** Give a user a platform role directly (service role, bypasses RLS). */
export async function assignPlatformRole(
  admin: SupabaseClient,
  userId: string,
  role: 'moderator' | 'admin',
  reason = 'integration test setup',
): Promise<void> {
  const { error } = await admin.from('user_roles').insert({
    user_id: userId,
    role,
    grant_reason: reason,
  })
  if (error) throw error
}
