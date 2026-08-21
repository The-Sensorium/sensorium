// send-emails: the delivery half of the outbox pipeline.
//
// Cron-driven from the database (pump_outbound_emails POSTs here, guarded by a
// shared secret). This function claims the next batch of queued emails under
// the service-role key, renders the template, forwards to Resend, and marks
// each row sent/failed. Hard delivery failures return to the queue and retry;
// the DB is the source of truth, this function is a worker.

import { renderEmail } from '../_shared/templates.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'

interface ClaimedEmail {
  id: string
  recipient_email: string
  template: string
  params: Record<string, unknown>
}

async function claimOutbox(
  supabaseUrl: string,
  serviceRoleKey: string,
  limit = 20,
): Promise<ClaimedEmail[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_outbound_emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ p_limit: limit }),
  })
  if (!res.ok) {
    throw new Error(`claim_outbound_emails ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as ClaimedEmail[]
}

async function markOutbox(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string,
  status: 'sent' | 'failed',
  error: string | null,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/rpc/mark_outbound_email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ p_id: id, p_status: status, p_error: error }),
  })
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    if (res.ok) return { ok: true, error: null }
    return { ok: false, error: `resend ${res.status}: ${await res.text()}` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// Cron polls with no JWT; the shared secret is the only credential. Verify
// it before doing anything.
function authorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('SENSORIUM_EMAIL_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM') ?? 'no-reply@thesensorium.online'

  if (!authorized(request, secret)) {
    return new Response('unauthorized', { status: 401 })
  }
  if (!supabaseUrl || !supabaseKey || !resendKey) {
    console.error('missing required env vars')
    return new Response('misconfigured', { status: 500 })
  }
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let claimed: ClaimedEmail[]
  try {
    claimed = await claimOutbox(supabaseUrl, supabaseKey)
  } catch (error) {
    console.error('claim failed:', error)
    return new Response('ok', { status: 200 }) // retried next tick
  }

  for (const email of claimed) {
    let rendered: ReturnType<typeof renderEmail>
    try {
      rendered = renderEmail(email.template as Parameters<typeof renderEmail>[0], email.params)
    } catch (error) {
      await markOutbox(supabaseUrl, supabaseKey, email.id, 'failed', String(error))
      continue
    }

    const result = await sendViaResend(resendKey, from, email.recipient_email, rendered.subject, rendered.html)
    await markOutbox(supabaseUrl, supabaseKey, email.id, result.ok ? 'sent' : 'failed', result.error)
    if (!result.ok) {
      console.error('send failed:', email.id, result.error)
    }
  }

  return new Response('ok', { status: 200 })
})