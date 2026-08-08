type MessageLike = { message?: unknown }

export function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error.trim() || fallback
  if (error instanceof Error) return error.message.trim() || fallback
  if (error && typeof error === 'object' && 'message' in error) {
    const raw = (error as MessageLike).message
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }
  return fallback
}

export function joinQueueErrorMessage(error: unknown): string {
  const message = toErrorMessage(error, '').toLowerCase()
  if (message.includes('cooldown')) {
    return 'You recently left a cluster in this mode. A 30-day cooldown is active.'
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
