import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

const projectId =
  Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId

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

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable'

export async function getPushPermission(): Promise<PushPermissionStatus> {
  try {
    const mod = await notifications()
    if (!mod) return 'unavailable'
    const current = await mod.getPermissionsAsync()
    return current.status === 'granted' ? 'granted' : current.status === 'denied' ? 'denied' : 'undetermined'
  } catch {
    return 'undetermined'
  }
}

export async function registerPushToken(): Promise<PushPermissionStatus> {
  // Silent only: never prompts. Returns the OS permission status; token
  // upload is best-effort and retried on foreground/sign-in in app-providers.
  try {
    const mod = await notifications()
    if (!mod || !supabase || !projectId) return 'unavailable'
    const current = await mod.getPermissionsAsync()
    if (current.status !== 'granted') return current.status === 'denied' ? 'denied' : 'undetermined'
    const token = (await mod.getExpoPushTokenAsync({ projectId })).data
    const { error } = await supabase.rpc('register_push_token', { p_expo_push_token: token })
    if (error) {
      await supabase.rpc('register_push_token', { p_expo_push_token: token })
    }
    return 'granted'
  } catch {
    return 'undetermined'
  }
}

export async function requestPushPermissionAndRegister(): Promise<PushPermissionStatus> {
  // Explicit user gesture: prompts for OS permission, then uploads the token
  // best-effort. Returns the OS permission status, not upload success.
  try {
    const mod = await notifications()
    if (!mod || !supabase || !projectId) return 'unavailable'
    const current = await mod.getPermissionsAsync()
    const status =
      current.status === 'granted' ? current.status : (await mod.requestPermissionsAsync()).status
    if (status !== 'granted') return status === 'denied' ? 'denied' : 'undetermined'
    const token = (await mod.getExpoPushTokenAsync({ projectId })).data
    const { error } = await supabase.rpc('register_push_token', { p_expo_push_token: token })
    if (error) {
      await supabase.rpc('register_push_token', { p_expo_push_token: token })
    }
    return 'granted'
  } catch {
    return 'undetermined'
  }
}

export async function refreshPushToken() {
  await registerPushToken()
}

export async function unregisterPushToken() {
  try {
    const mod = await notifications()
    if (!mod || !supabase) return
    try {
      const token = (await mod.getExpoPushTokenAsync({ projectId })).data
      await supabase.rpc('unregister_push_token', { p_expo_push_token: token })
    } catch {
    }
    await mod.setBadgeCountAsync(0).catch(() => undefined)
  } catch {
  }
}

export async function clearPushBadge() {
  try {
    const mod = await notifications()
    if (!mod) return
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
