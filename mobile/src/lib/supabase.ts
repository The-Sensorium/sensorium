import 'react-native-url-polyfill/auto'
import 'expo-sqlite/localStorage/install'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type { Database }
export type MatchingMode = Database['public']['Enums']['matching_mode']

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

function createSupabaseClient(url: string, anonKey: string) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null
  if (!anonKey || anonKey.length < 20) return null
  try {
    return createClient<Database>(url, anonKey, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  } catch {
    return null
  }
}

export const supabase: SupabaseClient<Database> | null =
  url && anonKey ? createSupabaseClient(url, anonKey) : null

export function startSupabaseAutoRefresh() {
  if (!supabase) return
  void supabase.auth.startAutoRefresh()
}

export function stopSupabaseAutoRefresh() {
  if (!supabase) return
  void supabase.auth.stopAutoRefresh()
}

export async function teardownRealtime() {
  if (!supabase) return
  await supabase.removeAllChannels().catch(() => undefined)
}

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    )
  }
  return supabase
}
