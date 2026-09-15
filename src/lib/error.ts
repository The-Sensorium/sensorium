type MessageLike = { message?: unknown }

const NETWORK_ERROR_PATTERN =
  /network request failed|failed to fetch|fetch failed|load failed|networkerror|network error|connection failure|failed to connect|couldn't connect|could not connect|unable to connect|connection refused|no internet|internet connection|connectexception|econnrefused|econnreset|etimedout|socketexception|offline/i

export function isNetworkError(error: unknown): boolean {
  if (typeof error === 'string') return NETWORK_ERROR_PATTERN.test(error)
  if (error instanceof Error) return NETWORK_ERROR_PATTERN.test(error.message)
  if (error && typeof error === 'object' && 'message' in error) {
    const raw = (error as MessageLike).message
    return typeof raw === 'string' && NETWORK_ERROR_PATTERN.test(raw)
  }
  return false
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (isNetworkError(error)) return fallback
  if (typeof error === 'string') return error.trim() || fallback
  if (error instanceof Error) return error.message.trim() || fallback
  if (error && typeof error === 'object' && 'message' in error) {
    const raw = (error as MessageLike).message
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }
  return fallback
}

export function joinQueueErrorMessage(error: unknown, mode?: string): string {
  const message = toErrorMessage(error, '').toLowerCase()
  if (message.includes('cooldown')) {
    const days = mode === 'open_mix' ? 7 : 30
    return `You recently left a cluster in this mode. A ${days}-day cooldown is active.`
  }
  if (message.includes('location_not_set') || message.includes('location not set') || message.includes('local radius')) {
    return 'Set your local radius first, then try again.'
  }
  if (message.includes('already_in_cluster') || message.includes('already in a cluster')) {
    return 'You’re already in a cluster for this mode.'
  }
  if (message.includes('already_in_queue') || message.includes('already in queue')) {
    return 'You’re already waiting in this queue.'
  }
  if (message.includes('complete onboarding')) {
    return 'Complete onboarding before joining a queue.'
  }
  return 'Something went wrong while joining. Please try again.'
}
