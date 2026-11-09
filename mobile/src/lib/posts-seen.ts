import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIX = 'sensorium:posts-seen:'

export function postsSeenKey(userId: string): string {
  return `${PREFIX}${userId}`
}

/** A stored watermark is only usable when it parses and is not in the future
 * (clock skew); otherwise a first run would badge the entire history or hide
 * posts until the clock catches up. */
export function resolveSeenAt(stored: string | null, now: Date): string {
  if (stored) {
    const parsed = Date.parse(stored)
    if (!Number.isNaN(parsed) && parsed <= now.getTime()) return stored
  }
  return now.toISOString()
}

export async function getPostsSeenAt(userId: string, now = new Date()): Promise<string> {
  const key = postsSeenKey(userId)
  const stored = await AsyncStorage.getItem(key).catch(() => null)
  const seenAt = resolveSeenAt(stored, now)
  if (stored !== seenAt) {
    await AsyncStorage.setItem(key, seenAt).catch(() => undefined)
  }
  return seenAt
}

export async function markPostsSeen(userId: string, now = new Date()): Promise<void> {
  await AsyncStorage.setItem(postsSeenKey(userId), now.toISOString())
}
