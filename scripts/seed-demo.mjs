// Seed the local Supabase stack with a rich, realistic demo dataset so every
// discovery/matching state is visible: clusters across all five matching modes,
// in both active and introductions phases, with varied member counts. The E2E
// golden path is preserved: diya@demo.example stays an active member of the
// 8-person "Aurora" cluster alongside rio@demo.example (mention autocomplete).
//
// Idempotent: safe to run repeatedly (e.g. after `supabase db reset`). Users and
// clusters are looked up by email/name and reused; only missing rows are added.
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

const DEMO_PASSWORD = process.env.E2E_PASSWORD ?? 'sensor123'

const DEMO = {
  email: process.env.E2E_EMAIL ?? 'diya@demo.example',
  password: DEMO_PASSWORD,
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
  password: DEMO_PASSWORD,
  displayName: 'Rio Mendez',
  dob: '1994-03-19',
  countryCode: 'PT',
  currentStatus: 'Thinking out loud',
}

// A pool of secondary demo members, reused across clusters (matching modes are
// independent, so a person can plausibly belong to several clusters at once).
const PEOPLE = [
  { name: 'Sofia Almeida', country: 'PT', dob: '1988-04-11', status: 'Off to a slow start today' },
  { name: 'Javier Ortiz', country: 'MX', dob: '1991-09-23', status: 'Working' },
  { name: 'Amelia Chen', country: 'US', dob: '1995-02-08', status: 'Studying' },
  { name: 'Kenji Sato', country: 'JP', dob: '1989-12-30', status: 'Available' },
  { name: 'Freya Holm', country: 'DE', dob: '1993-07-15', status: 'Reading' },
  { name: 'Noah Park', country: 'CA', dob: '1997-01-19', status: 'Gaming' },
  { name: 'Camille Laurent', country: 'FR', dob: '1990-08-02', status: 'Busy' },
  { name: 'Arjun Mehta', country: 'IN', dob: '1992-03-26', status: 'Working' },
  { name: 'Lucia Costa', country: 'BR', dob: '1994-11-05', status: 'Do not disturb' },
  { name: 'Mei Lin', country: 'SG', dob: '1987-06-18', status: 'Traveling' },
  { name: 'Tomas Novak', country: 'CZ', dob: '1991-10-09', status: 'Available' },
  { name: 'Nadia Petrov', country: 'UA', dob: '1996-04-27', status: 'Studying' },
  { name: 'Iskander Ali', country: 'EG', dob: '1989-02-14', status: 'Working' },
  { name: 'Elif Yilmaz', country: 'TR', dob: '1995-12-03', status: 'Reading' },
  { name: 'Mateo Rossi', country: 'IT', dob: '1993-05-21', status: 'Gaming' },
  { name: 'Aisha Khan', country: 'PK', dob: '1990-07-08', status: 'Busy' },
  { name: 'Henrik Olsen', country: 'NO', dob: '1997-09-12', status: 'Available' },
  { name: 'Yuna Lee', country: 'KR', dob: '1992-01-30', status: 'Working' },
  { name: 'João Pereira', country: 'PT', dob: '1994-08-06', status: 'Walking the dog' },
  { name: 'Inês Couto', country: 'PT', dob: '1996-03-19', status: 'Available' },
  { name: 'Rafael Sousa', country: 'PT', dob: '1993-12-05', status: 'Studying' },
  { name: 'Carla Mendes', country: 'PT', dob: '1990-10-22', status: 'Working' },
  { name: 'Miguel Tavares', country: 'PT', dob: '1987-06-29', status: 'Busy' },
  { name: 'Beatriz Rocha', country: 'PT', dob: '1998-02-17', status: 'Gaming' },
  { name: 'Pedro Nunes', country: 'BR', dob: '1991-04-03', status: 'Available' },
  { name: 'Beatriz Costa', country: 'PT', dob: '1992-09-15', status: 'Reading' },
  { name: 'Vlad Ivanov', country: 'RU', dob: '1989-03-09', status: 'Do not disturb' },
  { name: 'Gaia Monti', country: 'IT', dob: '1994-05-17', status: 'Traveling' },
  { name: 'Nils Berg', country: 'SE', dob: '1986-11-24', status: 'Available' },
  { name: 'Hana Kim', country: 'US', dob: '1996-08-14', status: 'Working' },
  { name: 'Omar Farouk', country: 'NG', dob: '1990-01-07', status: 'Reading' },
  { name: 'Priya Nair', country: 'IN', dob: '1993-06-02', status: 'Studying' },
  { name: 'Diego Ramos', country: 'AR', dob: '1995-10-28', status: 'Gaming' },
  { name: 'Marta Silva', country: 'ES', dob: '1988-03-05', status: 'Busy' },
  { name: 'Liam Murphy', country: 'IE', dob: '1992-12-11', status: 'Available' },
  { name: 'Zara Qadir', country: 'SA', dob: '1997-04-19', status: 'Working' },
  { name: 'Felix Weber', country: 'AT', dob: '1989-08-31', status: 'Do not disturb' },
  { name: 'Rina Takeda', country: 'JP', dob: '1994-02-22', status: 'Traveling' },
  { name: 'Piotr Nowak', country: 'PL', dob: '1991-07-16', status: 'Studying' },
  { name: 'Astrid Sørensen', country: 'DK', dob: '1987-05-09', status: 'Available' },
  { name: 'Marco Bellini', country: 'IT', dob: '1996-09-03', status: 'Working' },
  { name: 'Leila Haddad', country: 'LB', dob: '1990-11-30', status: 'Reading' },
  { name: 'Sam Williams', country: 'AU', dob: '1995-03-27', status: 'Gaming' },
  { name: 'Elena Sokolova', country: 'KZ', dob: '1992-10-05', status: 'Busy' },
  { name: 'Kwame Boateng', country: 'GH', dob: '1989-12-19', status: 'Available' },
  { name: 'Yuki Nakamura', country: 'JP', dob: '1997-01-25', status: 'Working' },
  { name: 'Emily Carter', country: 'GB', dob: '1991-06-13', status: 'Studying' },
  { name: 'Daniela Ortiz', country: 'MX', dob: '1996-02-28', status: 'Reading' },
]

// Member slots are 'diya' / 'rio' (the two login accounts) or an index into
// PEOPLE. `introductionsDone` marks how many of a cluster's members have
// already answered the intro questions (for the introductions phase only).
// `formedDaysAgo` gives clusters a realistic formation date on the tile.
const CLUSTERS = [
  {
    name: 'Aurora',
    mode: 'exact_birthdate',
    modeLabel: 'Exact Birthdate',
    queueKey: '1996-07-12',
    status: 'active',
    formedDaysAgo: 120,
    members: ['diya', 'rio', 0, 1, 2, 3, 4, 5],
  },
  {
    name: 'The Night Owls',
    mode: 'exact_birthdate',
    modeLabel: 'Exact Birthdate',
    queueKey: '1993-11-02',
    status: 'active',
    formedDaysAgo: 45,
    members: [6, 7, 8, 9, 10, 11, 12, 13],
  },
  {
    name: 'Solstice',
    mode: 'exact_birthdate',
    modeLabel: 'Exact Birthdate',
    queueKey: '1990-05-20',
    status: 'introductions',
    formedDaysAgo: 2,
    members: [14, 15, 16, 17, 18, 19, 20, 21],
    introductionsDone: 2,
  },
  {
    name: '1996 March Circle',
    mode: 'birth_year_month',
    modeLabel: 'Birth Year + Month',
    queueKey: '1996-03',
    status: 'active',
    formedDaysAgo: 90,
    members: [22, 23, 24, 25, 26, 27, 28, 29],
  },
  {
    name: 'The October Group',
    mode: 'birth_year_month',
    modeLabel: 'Birth Year + Month',
    queueKey: '1990-10',
    status: 'active',
    formedDaysAgo: 60,
    members: [3, 7, 11, 15, 19, 30, 39],
  },
  {
    name: 'Winter Folk',
    mode: 'birth_year_month',
    modeLabel: 'Birth Year + Month',
    queueKey: '1985-12',
    status: 'introductions',
    formedDaysAgo: 1,
    members: [31, 32, 33, 34, 35, 36, 37, 38],
    introductionsDone: 1,
  },
  {
    name: 'April Bloom',
    mode: 'birth_month',
    modeLabel: 'Birth Month',
    queueKey: '04',
    status: 'active',
    formedDaysAgo: 30,
    members: [1, 5, 9, 13, 17, 21, 24, 26],
  },
  {
    name: 'December Nights',
    mode: 'birth_month',
    modeLabel: 'Birth Month',
    queueKey: '12',
    status: 'introductions',
    formedDaysAgo: 3,
    members: [4, 8, 12, 16, 20, 25, 27, 39],
    introductionsDone: 3,
  },
  {
    name: "Class of '92",
    mode: 'birth_year',
    modeLabel: 'Birth Year',
    queueKey: '1992',
    status: 'active',
    formedDaysAgo: 75,
    members: [0, 3, 6, 10, 14, 18, 20, 25],
  },
  {
    name: 'Turn of the Century',
    mode: 'birth_year',
    modeLabel: 'Birth Year',
    queueKey: '1999',
    status: 'introductions',
    formedDaysAgo: 0,
    members: [40, 41, 42, 43, 44, 45, 46, 47],
    introductionsDone: 0,
  },
  {
    name: 'Lisbon Locals',
    mode: 'local',
    modeLabel: 'Local',
    queueKey: 'PT:lisbon:25',
    status: 'active',
    formedDaysAgo: 50,
    members: [2, 5, 8, 11, 14, 17, 20, 26],
  },
  {
    name: 'Porto Harbor',
    mode: 'local',
    modeLabel: 'Local',
    queueKey: 'PT:porto:50',
    status: 'introductions',
    formedDaysAgo: 2,
    members: [9, 13, 21, 29, 33, 37, 41, 45],
    introductionsDone: 2,
  },
  {
    name: 'Douro Valley',
    mode: 'local',
    modeLabel: 'Local',
    queueKey: 'PT:gaia:10',
    status: 'active',
    formedDaysAgo: 100,
    members: [0, 4, 7, 10, 15, 18, 22, 27],
  },
]

async function ensureUser(admin, email, { displayName, dob, countryCode, currentStatus }) {
  let user = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find(
    (u) => u.email === email,
  )
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
  } else {
    // Keep known credentials in sync so E2E logins work after a reseed.
    await admin.auth.admin.updateUserById(user.id, { password: DEMO_PASSWORD })
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
  return userId
}

// Resolve a CLUSTERS/QUEUES member slot ('diya' / 'rio' or a PEOPLE index) to
// the seed person spec used by ensureUser.
function personFor(slot) {
  return typeof slot === 'string'
    ? slot === 'diya'
      ? DEMO
      : DEMO_MEMBER
    : {
        email: `member-${slot}@demo.example`,
        displayName: PEOPLE[slot].name,
        dob: PEOPLE[slot].dob,
        countryCode: PEOPLE[slot].country,
        currentStatus: PEOPLE[slot].status,
      }
}

async function ensureMembership(admin, clusterId, userId) {
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
}

async function ensureCluster(admin, spec) {
  const active = spec.status === 'active'
  const { data: existing } = await admin
    .from('clusters')
    .select('id, status')
    .eq('name', spec.name)
    .limit(1)
  let clusterId = existing?.[0]?.id
  const introductionsDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
  const formedAt = new Date(
    Date.now() - (spec.formedDaysAgo ?? 0) * 24 * 60 * 60 * 1000,
  ).toISOString()

  if (!clusterId) {
    const { data, error } = await admin
      .from('clusters')
      .insert({
        name: spec.name,
        matching_mode: spec.mode,
        mode_label: spec.modeLabel,
        queue_key: spec.queueKey,
        status: spec.status,
        created_at: formedAt,
        introductions_deadline: active ? null : introductionsDeadline,
        introductions_completed_at: active ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
    if (error) throw error
    clusterId = data.id
  } else if (existing?.[0]?.status !== spec.status) {
    // Idempotent reseed keeps a cluster's state aligned with the catalog.
    const { error } = await admin
      .from('clusters')
      .update({
        status: spec.status,
        created_at: formedAt,
        introductions_deadline: active ? null : introductionsDeadline,
        introductions_completed_at: active ? new Date().toISOString() : null,
      })
      .eq('id', clusterId)
    if (error) throw error
  }

  const introductionsDone = spec.introductionsDone ?? 0
  for (let i = 0; i < spec.members.length; i += 1) {
    const person = personFor(spec.members[i])
    const userId = await ensureUser(admin, person.email, person)
    await ensureMembership(admin, clusterId, userId)
    // Active clusters were unlocked by their roster, so every member has a
    // completed intro; in the introductions phase only the first N have.
    if (active || i < introductionsDone) {
      await admin
        .from('cluster_members')
        .update({ intro_completed_at: new Date().toISOString() })
        .eq('cluster_id', clusterId)
        .eq('user_id', userId)
    }
  }
  return clusterId
}

// Queues the demo login is already sitting in, so the Discovery page shows the
// "X of 8 waiting" state alongside "You're in a cluster" and "No queue yet".
// Members are chosen so nobody is already in a cluster of the same mode, and
// each queue stays well under CLUSTER_SIZE so the queue_entries_formation
// trigger never fires and no extra cluster is created.
const QUEUES = [
  {
    mode: 'birth_year_month',
    modeLabel: 'Birth Year + Month',
    queueKey: '1996-07',
    members: ['diya', 0, 1, 2],
  },
  {
    mode: 'birth_year',
    modeLabel: 'Birth Year',
    queueKey: '1996',
    members: ['diya', 7, 9],
  },
]

async function ensureQueue(admin, spec) {
  for (let i = 0; i < spec.members.length; i += 1) {
    const person = personFor(spec.members[i])
    const userId = await ensureUser(admin, person.email, person)
    const { data: existing } = await admin
      .from('queue_entries')
      .select('user_id')
      .eq('mode', spec.mode)
      .eq('user_id', userId)
    if (existing?.length) continue
    // Stagger joined_at so the queue has a deterministic oldest-first order.
    const joinedAt = new Date(
      Date.now() - (spec.members.length - i) * 2 * 60 * 60 * 1000,
    ).toISOString()
    const { error } = await admin.from('queue_entries').insert({
      user_id: userId,
      mode: spec.mode,
      queue_key: spec.queueKey,
      joined_at: joinedAt,
    })
    if (error) throw error
  }
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

  // ---- the primary demo login (profile auto-created by on_auth_user_created) ----
  const userId = await ensureUser(admin, DEMO.email, {
    ...DEMO,
    currentStatus: 'Reading for a while',
  })
  await admin
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', userId)

  for (const spec of CLUSTERS) {
    await ensureCluster(admin, spec)
  }

  for (const spec of QUEUES) {
    await ensureQueue(admin, spec)
  }

  const { data: summary } = await admin
    .from('clusters')
    .select('matching_mode, status, name')
    .order('matching_mode', { ascending: true })
  const byMode = {}
  for (const c of summary ?? []) {
    byMode[c.matching_mode] = (byMode[c.matching_mode] ?? 0) + 1
  }

  console.log(
    `Seeded ${CLUSTERS.length} clusters (${Object.entries(byMode)
      .map(([mode, n]) => `${n} ${mode}`)
      .join(', ')}) and ${QUEUES.length} queues (${QUEUES.map(
      (q) => `${q.queueKey} (${q.members.length})`,
    ).join(', ')}) with demo user ${DEMO.email} in cluster "${DEMO.clusterName}" (${userId})`,
  )
}

seed().then(
  () => process.exit(0),
  (err) => {
    console.error('Seed failed:', err.message)
    process.exit(1)
  },
)