/**
 * Decide whether a query error should be retried by the global QueryClient.
 *
 * `PostgrestError` (the type every Supabase query throws) has no HTTP `status`
 * field: only `code` (PostgREST `PGRST3xx` or Postgres SQLSTATE such as
 * `42501`). Permanent client errors never recover on retry; transient network
 * failures and 5xx-class errors should still get the retry budget.
 */
export function isPermanentQueryError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string') return false
  if (code === '42501') return true
  return code.startsWith('PGRST3')
}
