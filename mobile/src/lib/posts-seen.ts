import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIX = 'sensorium:posts-seen:'

export function postsSeenKey(userId: string): string {
  return `${PREFIX}${userId}`
}

export function clusterPostsSeenKey(userId: string, clusterId: string): string {
  return `${PREFIX}${userId}:${clusterId}`
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

export async function getPostsSeenAt(
  userId: string,
  clusterId?: string,
  now = new Date(),
): Promise<string> {
  const key = clusterId ? clusterPostsSeenKey(userId, clusterId) : postsSeenKey(userId)
  const stored = await AsyncStorage.getItem(key).catch(() => null)
  if (stored !== null) {
    const seenAt = resolveSeenAt(stored, now)
    if (stored !== seenAt) {
      await AsyncStorage.setItem(key, seenAt).catch(() => undefined)
    }
    return seenAt
  }
  // Upgrade path: a cluster seen for the first time inherits the legacy
  // account-wide watermark, so existing users do not badge their whole history.
  if (clusterId) {
    const legacy = await AsyncStorage.getItem(postsSeenKey(userId)).catch(() => null)
    if (legacy !== null) {
      const seenAt = resolveSeenAt(legacy, now)
      await AsyncStorage.setItem(key, seenAt).catch(() => undefined)
      return seenAt
    }
  }
  const seenAt = now.toISOString()
  await AsyncStorage.setItem(key, seenAt).catch(() => undefined)
  return seenAt
}

export async function markPostsSeen(
  userId: string,
  clusterId?: string,
  now = new Date(),
): Promise<void> {
  const seenAt = now.toISOString()
  if (clusterId) {
    await AsyncStorage.setItem(clusterPostsSeenKey(userId, clusterId), seenAt).catch(() => undefined)
  }
  // Keep the legacy key fresh as the fallback for clusters joined later, so
  // their first read starts from the latest Posts visit anywhere.
  await AsyncStorage.setItem(postsSeenKey(userId), seenAt).catch(() => undefined)
}
