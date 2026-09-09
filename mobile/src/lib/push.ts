import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

type NotificationsModule = typeof import('expo-notifications')

let cached: NotificationsModule | null | undefined

async function notifications(): Promise<NotificationsModule | null> {
  if (cached !== undefined) return cached
  if (Constants.appOwnership === 'expo') {
    cached = null
    return cached
  }
  if (Platform.OS === 'web') {
    cached = null
    return cached
  }
  try {
    const mod = await import('expo-notifications')
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    })
    if (Platform.OS === 'android') {
      const importance = mod.AndroidImportance?.HIGH ?? 4
      const def = mod.AndroidImportance?.DEFAULT ?? 3
      await Promise.all([
        mod.setNotificationChannelAsync('messages', { name: 'Messages', importance: def }),
        mod.setNotificationChannelAsync('mentions', { name: 'Mentions', importance }),
        mod.setNotificationChannelAsync('invites', { name: 'Invites', importance }),
        mod.setNotificationChannelAsync('governance', { name: 'Governance', importance: def }),
      ]).catch(() => undefined)
    }
    cached = mod
  } catch {
    cached = null
  }
  return cached
}

export async function getPushPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const mod = await notifications()
    if (!mod) return 'undetermined'
    const current = await mod.getPermissionsAsync()
    return current.status === 'granted' ? 'granted' : current.status === 'denied' ? 'denied' : 'undetermined'
  } catch {
    return 'undetermined'
  }
}

export async function registerPushToken(userId: string) {
  try {
    const mod = await notifications()
    if (!mod || !supabase) return
    const current = await mod.getPermissionsAsync()
    if (current.status === 'denied') return
    const status =
      current.status === 'granted' ? current.status : (await mod.requestPermissionsAsync()).status
    if (status !== 'granted') return
    const token = (await mod.getExpoPushTokenAsync()).data
    await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, expo_push_token: token, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,expo_push_token' },
      )
  } catch {
  }
}

export async function refreshPushToken(userId: string) {
  await registerPushToken(userId)
}

export async function unregisterPushToken() {
  try {
    const mod = await notifications()
    if (!mod || !supabase) return
    const token = (await mod.getExpoPushTokenAsync()).data
    await supabase.from('push_tokens').delete().eq('expo_push_token', token)
    await mod.setBadgeCountAsync(0).catch(() => undefined)
  } catch {
  }
}

export async function syncBadgeCount(unread: number) {
  try {
    const mod = await notifications()
    if (!mod) return
    await mod.setBadgeCountAsync(Math.max(0, unread)).catch(() => undefined)
  } catch {
  }
}

export type PushResponse = { data?: Record<string, unknown> }

export async function onPushResponse(
  handler: (data: Record<string, unknown>) => void,
): Promise<() => void> {
  try {
    const mod = await notifications()
    if (!mod) return () => undefined
    const sub = mod.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content
      handler(((content.data ?? {}) as Record<string, unknown>))
    })
    return () => sub.remove()
  } catch {
    return () => undefined
  }
}

/**
 * Returns the deep-link payload of the notification that launched the app, if
 * any. `addNotificationResponseReceivedListener` does not fire for a tap that
 * cold-starts a terminated app, so call this once at startup and route if it
 * resolves to a payload.
 */
export async function getLaunchPushData(): Promise<Record<string, unknown> | null> {
  try {
    const mod = await notifications()
    if (!mod) return null
    const response = await mod.getLastNotificationResponseAsync()
    if (!response) return null
    return (response.notification.request.content.data ?? {}) as Record<string, unknown>
  } catch {
    return null
  }
}
