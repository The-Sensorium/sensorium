import Constants from 'expo-constants'
import { supabase } from './supabase'

type NotificationsModule = typeof import('expo-notifications')

let cached: NotificationsModule | null | undefined

async function notifications(): Promise<NotificationsModule | null> {
  if (cached !== undefined) return cached
  if (Constants.appOwnership === 'expo') {
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
    cached = mod
  } catch {
    cached = null
  }
  return cached
}

export async function registerPushToken(userId: string) {
  try {
    const mod = await notifications()
    if (!mod || !supabase) return
    const current = await mod.getPermissionsAsync()
    const status =
      current.status === 'granted'
        ? current.status
        : (await mod.requestPermissionsAsync()).status
    if (status !== 'granted') return
    const token = (await mod.getExpoPushTokenAsync()).data
    await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token' },
    )
  } catch {
    // Push registration is best-effort; the app works fully without it.
  }
}

export async function unregisterPushToken() {
  try {
    const mod = await notifications()
    if (!mod || !supabase) return
    const token = (await mod.getExpoPushTokenAsync()).data
    await supabase.from('push_tokens').delete().eq('expo_push_token', token)
  } catch {
    // Best-effort cleanup only.
  }
}
