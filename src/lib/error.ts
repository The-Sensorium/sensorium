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

export function isRateLimited(error: unknown): boolean {
  return toErrorMessage(error, '').toLowerCase().includes('rate_limited')
}

/** Friendly copy for hot-write rate limits; falls back to the raw message. */
export function rateLimitMessage(error: unknown, fallback: string): string {
  if (isRateLimited(error)) return 'You’re doing that too quickly. Please wait a bit and try again.'
  return toErrorMessage(error, fallback)
}

export function joinQueueErrorMessage(error: unknown, mode?: string): string {
  const message = toErrorMessage(error, '').toLowerCase()
  if (message.includes('rate_limited')) {
    return 'You’re joining queues too quickly. Please wait a bit and try again.'
  }
  if (message.includes('cooldown')) {
    const days = mode === 'open_mix' || mode === 'local' ? 3 : 7
    return `You recently left a cluster in this mode. A ${days}-day cooldown is active.`
  }
  if (message.includes('location_not_set') || message.includes('location not set') || message.includes('local radius')) {
    return 'Set your local radius first, then try again.'
  }
  if (message.includes('invalid_radius')) {
    return 'That radius is not supported. Choose 10, 50, or 100 km.'
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

/** Friendly copy for created-cluster invite errors; falls back to the raw message. */
export function inviteErrorMessage(error: unknown, fallback: string): string {
  const message = toErrorMessage(error, '').toLowerCase()
  if (message.includes('rate_limited')) {
    return 'You’re sending invites too quickly. Please wait a bit and try again.'
  }
  if (message.includes('previously_declined')) {
    return 'They declined an invitation to this cluster, so they can’t be invited again.'
  }
  if (message.includes('already_invited')) {
    return 'They already have a pending invitation to this cluster.'
  }
  if (message.includes('already_member')) {
    return 'They’re already in this cluster.'
  }
  if (message.includes('cluster_full')) {
    return 'This cluster is full (8 members max).'
  }
  if (message.includes('not_eligible')) {
    return 'They can only be invited if you’ve shared a cluster and their account is active.'
  }
  if (message.includes('invalid_name')) {
    return 'Give your cluster a name between 1 and 50 characters.'
  }
  if (message.includes('invalid_invite_count')) {
    return 'Invite between 2 and 7 people to start a cluster.'
  }
  return toErrorMessage(error, fallback)
}
