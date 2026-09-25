import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import { requireSupabase, type Database } from './supabase'

export type Profile = Database['public']['Tables']['profiles']['Row']

export function profileKey(userId: string) {
  return ['profile', userId] as const
}

/** Reads the signed-in user's own profile row (RLS: self read). */
export function useProfile() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: profileKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    // Slow-moving row: keep warm across navigations so guard checks do not
    // refetch on every page change. Focus/reconnect refetch keeps the UI
    // responsive to external changes on return.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
