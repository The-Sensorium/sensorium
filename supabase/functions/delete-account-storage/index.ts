// delete-account-storage: physically deletes every Storage object owned by the
// calling account, then lets the app finish the account deletion.
//
// Callers are the web SPA and the mobile app with the caller's Supabase JWT
// ([functions.delete-account-storage] verify_jwt = true in supabase/config.toml),
// so the base64 parse below is identity extraction only, not verification.
//
// The client-scoped member delete policies (chat-images, posts-images) require
// active cluster membership, so objects in clusters the user has already left
// are unreachable through a normal signed-in delete. This function deletes under
// the service-role key, which bypasses RLS: it is the only place the service-role
// key is used, and the object list is derived server-side from the caller's JWT
// sub via the service-role-only RPC get_storage_objects_for_account, so a caller
// can only ever delete objects they own. No client-supplied paths are accepted.
//
// The storage service's bulk DELETE (DELETE /object/{bucket} with {prefixes})
// permanently removes the underlying files (the supported Storage API; metadata
// row deletes alone orphan files). It is idempotent for already-missing paths.
// A GET info pass after deletion verifies nothing remains before the caller is
// allowed to proceed; failures return ok:false so the app aborts account
// deletion and the user can retry.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

/** Encode each path segment so the object key survives URL routing untouched. */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

interface OwnedObject {
  bucket: string
  path: string
}

async function listAccountObjects(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<OwnedObject[]> {
  // PostgREST caps one RPC response at 1000 rows and doesn't honor Range
  // headers on RPC calls, so page with the function's own OFFSET/LIMIT until a
  // short page signals the end of the deterministic (bucket, path) stream.
  //
  // IMPORTANT: this enumeration must complete BEFORE any deletion starts.
  // OFFSET pagination is only correct while the enumerated rows are unchanged;
  // deleting page 1 and then fetching page 2 by OFFSET would see a shrunken
  // row set and silently skip objects. All pages are collected here first, the
  // delete step below then targets the fixed, fully-enumerated list.
  const PAGE_SIZE = 1000
  const all: OwnedObject[] = []
  let offset = 0
  for (;;) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_storage_objects_for_account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ p_user_id: userId, p_offset: offset, p_limit: PAGE_SIZE }),
    })
    if (!res.ok) throw new Error(`list ${res.status}`)
    const rows = (await res.json()) as OwnedObject[]
    // Advance by the number of rows actually returned and only stop on an empty
    // page, so enumeration stays correct even if a deployment caps responses
    // below PAGE_SIZE.
    all.push(...rows)
    if (rows.length === 0) break
    offset += rows.length
  }
  return all
}

function storageHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('missing required env vars')
    return json({ ok: false, error: 'misconfigured' }, 500)
  }

  const auth = request.headers.get('authorization') ?? ''
  const match = /^Bearer (.+)$/.exec(auth)
  if (!match) return json({ ok: false, error: 'unauthorized' }, 401)

  // The gateway (verify_jwt) already checked the token's signature and expiry.
  // Here we parse the claims to re-assert this is an authenticated user session,
  // not the anon or service-role key: both are signed JWTs without a user `sub`,
  // and the anon/service keys must never reach the service-role deletion path.
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(base64UrlDecode(match[1]!.split('.')[1]!)) as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }
  const userId = claims.sub
  if (claims.role !== 'authenticated' || typeof userId !== 'string' || userId.length === 0) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  let owned: OwnedObject[]
  try {
    owned = await listAccountObjects(supabaseUrl, serviceRoleKey, userId)
  } catch {
    console.error('object list failed')
    return json({ ok: false, error: 'list_failed' }, 200)
  }
  if (owned.length === 0) return json({ ok: true, deleted: 0 }, 200)

  const byBucket = new Map<string, string[]>()
  for (const object of owned) {
    const paths = byBucket.get(object.bucket) ?? []
    paths.push(object.path)
    byBucket.set(object.bucket, paths)
  }

  // `owned` is the complete, pre-deletion snapshot from listAccountObjects, so
  // OFFSET pagination above was safe. Only now do we delete the fixed list. The
  // Storage API caps bulk deletes at MAX_OBJECTS_PER_REQUEST (1000; the docs
  // say `remove` handles 1000 at a time), so split each bucket's objects into
  // 500-path batches. Any over-cap request would otherwise be rejected.
  const MAX_DELETE_BATCH = 500
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += MAX_DELETE_BATCH) {
      const batch = paths.slice(i, i + MAX_DELETE_BATCH)
      const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...storageHeaders(serviceRoleKey) },
        body: JSON.stringify({ prefixes: batch }),
      })
      if (!res.ok) {
        console.error('delete failed', bucket, res.status)
        return json({ ok: false, error: `delete_failed:${res.status}` }, 200)
      }
    }
  }

  // The deletion is only success when nothing the account owns still exists.
  // Verifying every path serially would be thousands of round-trips for a large
  // account and could blow the function's wall-clock budget, so run the checks
  // with bounded concurrency instead. Any surviving object aborts the run.
  const MAX_VERIFY_CONCURRENCY = 25
  const targets: Array<{ bucket: string; path: string }> = []
  for (const [bucket, paths] of byBucket) {
    for (const path of paths) targets.push({ bucket, path })
  }
  let cursor = 0
  let verifyError: string | null = null
  async function verifyWorker(): Promise<void> {
    while (verifyError === null && cursor < targets.length) {
      const target = targets[cursor]!
      cursor += 1
      const res = await fetch(
        `${supabaseUrl}/storage/v1/object/info/${target.bucket}/${encodePath(target.path)}`,
        { headers: storageHeaders(serviceRoleKey) },
      )
      if (res.status === 200) {
        verifyError = 'object_still_exists'
        return
      }
      if (res.status >= 500) {
        verifyError = 'verify_failed'
        return
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_VERIFY_CONCURRENCY, targets.length) },
      () => verifyWorker(),
    ),
  )
  if (verifyError !== null) return json({ ok: false, error: verifyError }, 200)

  return json({ ok: true, deleted: owned.length }, 200)
})