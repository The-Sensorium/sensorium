// Seed the local Supabase stack with the data the E2E golden path needs.
// Idempotent: safe to run repeatedly (e.g. after `supabase db reset`).
//
// Config (in priority order):
//   SEED_SUPABASE_URL / SEED_SERVICE_ROLE_KEY env vars, else
//   VITE_SUPABASE_URL + the service_role key printed by `supabase status`, else
//   http://127.0.0.1:54321 + a key discovered from the running CLI stack.
//
// Usage: npm run seed:demo

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

const SERVICE_KEY_LABEL = 'service_role key:'

function supabaseStatusRaw() {
  try {
    return execSync('npx supabase status -o json', { encoding: 'utf8' }).trim()
  } catch (err) {
    throw new Error(
      'Supabase stack is not running. Run `supabase start` first:\n' + err.message,
    )
  }
}

function supabaseStatusJson() {
  const raw = supabaseStatusRaw()
  try {
    return JSON.parse(raw)
  } catch {
    // Older CLI text output; fall back to line extraction.
    return { _text: raw }
  }
}

function extract(output, needle) {
  const line = String(output ?? '')
    .split('\n')
    .find((l) => l.toLowerCase().includes(needle))
  if (!line) return null
  const parts = line.split(':')
  const value = parts.slice(1).join(':').trim()
  return value.replace(/^"|"$/g, '').trim() || null
}

function resolveConfig() {
  const json = supabaseStatusJson()
  const url =
    process.env.SEED_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    json.API_URL ||
    extract(json._text, 'API URL:')
  const serviceRole =
    process.env.SEED_SERVICE_ROLE_KEY ||
    json.SERVICE_ROLE_KEY ||
    extract(json._text, SERVICE_KEY_LABEL)
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    json.PUBLISHABLE_KEY ||
    json.ANON_KEY ||
    extract(json._text, 'anon key:')
  if (!url || !serviceRole) {
    throw new Error(
      'Could not resolve Supabase URL/service role. Provide SEED_SUPABASE_URL + SEED_SERVICE_ROLE_KEY.',
    )
  }
  return { url, serviceRole, anonKey }
}

const DEMO = {
  email: process.env.E2E_EMAIL ?? 'diya@demo.example',
  password: process.env.E2E_PASSWORD ?? 'sensor123',
  displayName: 'Diya Sharma',
  dob: '1996-07-12',
  countryCode: 'PT',
  clusterName: 'Aurora',
  mode: 'exact_birthdate',
  modeLabel: 'Exact Birthdate',
  queueKey: '1996-07-12',
}

// A second member of the Aurora cluster so mention autocomplete (and other
// member-dependent flows) have someone to mention in a fresh CI database.
const DEMO_MEMBER = {
  email: process.env.E2E_MEMBER_EMAIL ?? 'rio@demo.example',
  password: process.env.E2E_PASSWORD ?? 'sensor123',
  displayName: 'Rio Mendez',
  dob: '1994-03-19',
  countryCode: 'PT',
  currentStatus: 'Thinking out loud',
}

async function ensureClusterMember(admin, { email, password, displayName, dob, countryCode, currentStatus }, clusterId) {
  let user = (await admin.auth.admin.listUsers({ perPage: 100 })).data.users.find((u) => u.email === email)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
  } else {
    // Keep known credentials in sync so E2E logins work after a reseed.
    await admin.auth.admin.updateUserById(user.id, { password })
  }
  const userId = user.id

  const profile = await admin.from('profiles').select('id, dob').eq('id', userId).maybeSingle()
  if (profile.error) throw profile.error
  let fresh = false
  if (!profile.data) {
    const { error } = await admin.from('profiles').insert({ id: userId, email })
    if (error) throw error
    fresh = true
  }
  // dob is immutable once set, so only apply it to a freshly created profile.
  const patch = {
    display_name: displayName,
    country_code: countryCode,
    current_status: currentStatus,
    ...(fresh || profile.data?.dob == null ? { dob } : {}),
  }
  const { error: pErr } = await admin.from('profiles').update(patch).eq('id', userId)
  if (pErr) throw pErr

  const { data: memberRows } = await admin
    .from('cluster_members')
    .select('user_id')
    .eq('cluster_id', clusterId)
    .eq('user_id', userId)
  if (!memberRows?.length) {
    const { error } = await admin.from('cluster_members').insert({
      cluster_id: clusterId,
      user_id: userId,
    })
    if (error) throw error
  }
  return userId
}

async function seed() {
  const { url, serviceRole, anonKey } = resolveConfig()

  // Write a local .env so the Vite dev server can connect to this stack.
  if (url && anonKey) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      '.env',
      `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`,
    )
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ---- ensure the auth user (profile auto-created by on_auth_user_created) ----
  let user = (await admin.auth.admin.listUsers({ perPage: 100 })).data.users.find(
    (u) => u.email === DEMO.email,
  )
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO.email,
      password: DEMO.password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
  } else {
    // Known-creds should stay in sync so E2E logins work after a reseed.
    await admin.auth.admin.updateUserById(user.id, { password: DEMO.password })
  }
  const userId = user.id

  // ---- profile ----
  const profile = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (profile.error) throw profile.error
  if (!profile.data) {
    // Trigger should have created it; be defensive if it was skipped.
    const { error } = await admin
      .from('profiles')
      .insert({ id: userId, email: DEMO.email })
    if (error) throw error
  }
  const { error: pErr } = await admin
    .from('profiles')
    .update({
      display_name: DEMO.displayName,
      dob: DEMO.dob,
      country_code: DEMO.countryCode,
      current_status: 'Reading for a while',
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', userId)
  if (pErr) throw pErr

  // ---- cluster (idempotent) ----
  const { data: existing } = await admin
    .from('clusters')
    .select('id')
    .eq('name', DEMO.clusterName)
    .limit(1)
  let clusterId = existing?.[0]?.id
  if (!clusterId) {
    const { data, error } = await admin
      .from('clusters')
      .insert({
        name: DEMO.clusterName,
        matching_mode: DEMO.mode,
        mode_label: DEMO.modeLabel,
        queue_key: DEMO.queueKey,
        status: 'active',
        introductions_completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error) throw error
    clusterId = data.id
  } else {
    // Ensure the room is unlocked even if the cluster already exists (idempotent reseed).
    const { error } = await admin
      .from('clusters')
      .update({
        status: 'active',
        introductions_completed_at: new Date().toISOString(),
      })
      .eq('id', clusterId)
    if (error) throw error
  }

  // ---- membership ----
  const { data: memberRows } = await admin
    .from('cluster_members')
    .select('user_id')
    .eq('cluster_id', clusterId)
    .eq('user_id', userId)
  if (!memberRows?.length) {
    const { error } = await admin.from('cluster_members').insert({
      cluster_id: clusterId,
      user_id: userId,
    })
    if (error) throw error
  }

  // A second member so mention autocomplete has candidates to offer.
  await ensureClusterMember(admin, DEMO_MEMBER, clusterId)

  console.log(
    `Seeded demo user ${DEMO.email} in cluster "${DEMO.clusterName}" (${userId})`,
  )
}

seed().then(
  () => process.exit(0),
  (err) => {
    console.error('Seed failed:', err.message)
    process.exit(1)
  },
)