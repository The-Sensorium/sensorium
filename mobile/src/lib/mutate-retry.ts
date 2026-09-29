import { isPermanentQueryError } from './query-retry'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run a mutation with exponential backoff + jitter for transient failures.
 * Permanent errors (RLS `42501`, PostgREST `PGRST3xx`) throw immediately.
 * Used for chat/post/vote sends on flaky mobile networks.
 */
export async function mutateWithRetry<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseMs?: number },
): Promise<T> {
  const retries = options?.retries ?? 3
  const baseMs = options?.baseMs ?? 500
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (error) {
      if (isPermanentQueryError(error)) throw error
      if (attempt >= retries) throw error
      attempt += 1
      const jitter = Math.random() * 100
      await delay(baseMs * 2 ** (attempt - 1) + jitter)
    }
  }
}
