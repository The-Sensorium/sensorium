// send-push: the delivery half of the push pipeline.
//
// Cron-driven from the database (pump_push_notifications POSTs here, guarded
// by a shared secret). This function claims the next batch of queued pushes
// under the service-role key, forwards them to the Expo Push API, and marks
// each row sent/failed. Tokens that Expo reports as DeviceNotRegistered are
// deleted so the table does not rot. The DB is the source of truth; this
// function is a worker.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface ClaimedPush {
  id: string
  expo_push_token: string
  title: string
  body: string | null
  data: Record<string, unknown>
  channel: string
}

interface ExpoReceipt {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

async function claimPush(
  supabaseUrl: string,
  serviceRoleKey: string,
  limit = 50,
): Promise<ClaimedPush[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_push_notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ p_limit: limit }),
  })
  if (!res.ok) {
    throw new Error(`claim_push_notifications ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as ClaimedPush[]
}

async function markPush(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string,
  status: 'sent' | 'failed',
  error: string | null,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/rpc/mark_push_notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ p_id: id, p_status: status, p_error: error }),
  })
}

async function deleteToken(supabaseUrl: string, serviceRoleKey: string, token: string): Promise<void> {
  await fetch(
    `${supabaseUrl}/rest/v1/push_tokens?expo_push_token=eq.${encodeURIComponent(token)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  )
}

async function sendViaExpo(
  messages: Record<string, unknown>[],
  accessToken: string | undefined,
): Promise<(ExpoReceipt | null)[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  const receipts: (ExpoReceipt | null)[] = []
  // Expo caps each request at 100 messages; one row per (outbox x token) means
  // a deep queue can exceed that, so split and flatten in input order.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      throw new Error(`expo push ${res.status}: ${await res.text()}`)
    }
    const json = (await res.json()) as { data?: (ExpoReceipt | null)[] }
    receipts.push(...(json.data ?? []))
  }
  return receipts
}

function authorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('SENSORIUM_PUSH_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')

  if (!authorized(request, secret)) {
    return new Response('unauthorized', { status: 401 })
  }
  if (!supabaseUrl || !supabaseKey) {
    console.error('missing required env vars')
    return new Response('misconfigured', { status: 500 })
  }
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let claimed: ClaimedPush[]
  try {
    claimed = await claimPush(supabaseUrl, supabaseKey)
  } catch (error) {
    console.error('claim failed:', error)
    return new Response('ok', { status: 200 })
  }
  if (claimed.length === 0) return new Response('ok', { status: 200 })

  const messages = claimed.map((push) => ({
    to: push.expo_push_token,
    title: push.title,
    body: push.body ?? undefined,
    data: push.data,
    channelId: push.channel,
    sound: 'default',
  }))

  let receipts: (ExpoReceipt | null)[]
  try {
    receipts = await sendViaExpo(messages, expoAccessToken)
  } catch (error) {
    console.error('expo send failed:', error)
    for (const push of claimed) {
      await markPush(supabaseUrl, supabaseKey, push.id, 'failed', String(error))
    }
    return new Response('ok', { status: 200 })
  }

  for (let i = 0; i < claimed.length; i++) {
    const push = claimed[i]!
    const receipt = receipts[i]
    if (!receipt) {
      await markPush(supabaseUrl, supabaseKey, push.id, 'failed', 'missing receipt')
      continue
    }
    if (receipt.status === 'ok') {
      await markPush(supabaseUrl, supabaseKey, push.id, 'sent', null)
      continue
    }
    const error = receipt.details?.error ?? receipt.message ?? 'expo error'
    if (error === 'DeviceNotRegistered') {
      await deleteToken(supabaseUrl, supabaseKey, push.expo_push_token)
      await markPush(supabaseUrl, supabaseKey, push.id, 'failed', error)
    } else {
      await markPush(supabaseUrl, supabaseKey, push.id, 'failed', error)
    }
    console.error('send failed:', push.id, error)
  }

  return new Response('ok', { status: 200 })
})
