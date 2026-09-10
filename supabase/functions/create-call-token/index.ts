// create-call-token: mints a short-lived LiveKit access token for a cluster call.
//
// The browser/app can never hold the LiveKit API secret, so token signing
// lives here. The gateway verifies the caller's Supabase JWT (verify_jwt), and
// this function re-asserts access by hand with the service-role key: the caller
// must be an active member of the call's cluster, the call must not have ended,
// and the cluster must not be archived. (The function bypasses RLS, so these
// checks mirror the RPC/RLS predicates in 0107/0108 instead of relying on them.)
//
// Env (function env only, never the client or DB):
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
// Local: `supabase functions serve create-call-token --env-file supabase/functions/.env`

const TOKEN_TTL_SECONDS = 600

interface CallRow {
  id: string
  cluster_id: string
  status: 'ringing' | 'active' | 'ended'
  expires_at: string
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

async function signHs256(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return base64UrlEncode(new Uint8Array(sig))
}

async function mintLiveKitToken(
  room: string,
  identity: string,
  name: string | null,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        iss: apiKey,
        sub: identity,
        name: name ?? identity,
        iat: now,
        nbf: now,
        exp: now + TOKEN_TTL_SECONDS,
        video: {
          roomJoin: true,
          room,
          canPublish: true,
          canSubscribe: true,
          // No screen sharing in Sensorium calls: LiveKit's ControlBar hides the
          // screen-share control when the source isn't granted, and this blocks
          // it at the media plane too.
          canPublishSources: ['camera', 'microphone'],
        },
      }),
    ),
  )
  const unsigned = `${header}.${payload}`
  return `${unsigned}.${await signHs256(unsigned, apiSecret)}`
}

async function rest<T>(supabaseUrl: string, serviceRoleKey: string, path: string): Promise<T> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })
  if (!res.ok) throw new Error(`rest ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

async function rpc<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The web app calls this function cross-origin from the browser, so every
// response (including the OPTIONS preflight) must carry CORS headers. Native
// (mobile) fetch ignores CORS, which is why this only bit the web client.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const livekitUrl = Deno.env.get('LIVEKIT_URL')
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!livekitUrl || !apiKey || !apiSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('missing required env vars')
    return json({ error: 'misconfigured' }, 500)
  }

  let callId: unknown
  try {
    callId = (await request.json()).call_id
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (typeof callId !== 'string' || !UUID_RE.test(callId)) {
    return json({ error: 'bad_request' }, 400)
  }

  const auth = request.headers.get('authorization') ?? ''
  const match = /^Bearer (.+)$/.exec(auth)
  if (!match) return json({ error: 'unauthorized' }, 401)
  let callerId: unknown
  try {
    callerId = JSON.parse(base64UrlDecode(match[1]!.split('.')[1]!)).sub
  } catch {
    return json({ error: 'unauthorized' }, 401)
  }
  if (typeof callerId !== 'string' || callerId.length === 0) {
    return json({ error: 'unauthorized' }, 401)
  }

  // Mirror the RPC predicate: a suspended/banned account can't mint a token even
  // if it still holds an open participant row.
  let activeAccount: boolean
  try {
    activeAccount = await rpc<boolean>(supabaseUrl, serviceRoleKey, 'is_account_active', {
      p_user_id: callerId,
    })
  } catch (error) {
    console.error('account check failed:', error)
    return json({ error: 'misconfigured' }, 500)
  }
  if (!activeAccount) return json({ error: 'account_inactive' }, 403)

  let calls: CallRow[]
  try {
    calls = await rest<CallRow[]>(
      supabaseUrl,
      serviceRoleKey,
      `calls?id=eq.${callId}&select=id,cluster_id,status,expires_at`,
    )
  } catch (error) {
    console.error('call lookup failed:', error)
    return json({ error: 'misconfigured' }, 500)
  }
  const call = calls[0]
  if (!call) return json({ error: 'call_not_found' }, 404)
  if (call.status === 'ended' || Date.parse(call.expires_at) <= Date.now()) {
    return json({ error: 'call_ended' }, 403)
  }

  let members: { user_id: string }[]
  let clusters: { status: string }[]
  let participants: { user_id: string }[]
  let profiles: { display_name: string | null }[]
  let token: string
  try {
    ;[members, clusters, participants, profiles] = await Promise.all([
      rest<{ user_id: string }[]>(
        supabaseUrl,
        serviceRoleKey,
        `cluster_members?cluster_id=eq.${call.cluster_id}&user_id=eq.${callerId}&left_at=is.null&select=user_id`,
      ),
      rest<{ status: string }[]>(
        supabaseUrl,
        serviceRoleKey,
        `clusters?id=eq.${call.cluster_id}&select=status`,
      ),
      rest<{ user_id: string }[]>(
        supabaseUrl,
        serviceRoleKey,
        `call_participants?call_id=eq.${call.id}&user_id=eq.${callerId}&left_at=is.null&select=user_id`,
      ),
      rest<{ display_name: string | null }[]>(
        supabaseUrl,
        serviceRoleKey,
        `profiles?id=eq.${callerId}&select=display_name`,
      ),
    ])
    if (members.length === 0) return json({ error: 'not_member' }, 403)
    if (clusters[0]?.status === 'archived') return json({ error: 'cluster_archived' }, 403)
    // Membership is not enough: the caller must have joined via join_call/start_call,
    // so the participant list (and its cap) is the real gate to the media plane.
    if (participants.length === 0) return json({ error: 'not_participant' }, 403)

    // Room is unique per call, not per cluster: a stable name would surface any
    // lingering connection from a previous call in the same cluster (ghost
    // participant) inside the new call. call.id is shared by every joiner.
    token = await mintLiveKitToken(
      `cluster:${call.cluster_id}:${call.id}`,
      callerId,
      profiles[0]?.display_name ?? null,
      apiKey,
      apiSecret,
    )
  } catch (error) {
    // Keep even unexpected failures CORS-clean so the browser surfaces the error
    // instead of an opaque CORS failure.
    console.error('token mint failed:', error)
    return json({ error: 'server_error' }, 500)
  }

  return json({ token, url: livekitUrl }, 200)
})
