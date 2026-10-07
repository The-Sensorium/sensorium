/**
 * Decide whether a query error should be retried by the global QueryClient.
 *
 * `PostgrestError` (the type every Supabase query throws) has no HTTP `status`
 * field: only `code` (PostgREST `PGRSTxxx` or Postgres SQLSTATE such as
 * `42501`) plus a human `message`. Permanent client errors never recover on
 * retry; transient failures should still get the retry budget.
 *
 * PostgREST `PGRST3xx` codes are auth errors, but they are not all permanent:
 * `PGRST301` is also what PostgREST returns for an expired access token
 * ("JWT expired"). That case is usually transient: supabase-js refreshes the
 * token in the background (`autoRefreshToken`), and TanStack's default
 * `retryDelay` backs off ~1s/2s before each attempt, so a retry a moment
 * later typically succeeds. If the refresh already missed (e.g. a timer
 * throttled while backgrounded), the retries just fail the same way and the
 * error surfaces as before. Only the non-expiry auth failures (bad
 * signature, missing role claim, anonymous access to authenticated-only
 * RPCs) are permanent.
 */
export function isJwtExpiredError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (typeof code !== 'string' || typeof message !== 'string') return false
  return code.startsWith('PGRST3') && /((jwt|token).*expired|expired.*(jwt|token))/i.test(message)
}

export function isPermanentQueryError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string') return false
  if (code === '42501') return true
  if (!code.startsWith('PGRST3')) return false
  return !isJwtExpiredError(error)
}
