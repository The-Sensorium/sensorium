import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth-context'
import { requireSupabase, type Database } from './supabase'

export type Profile = Database['public']['Tables']['profiles']['Row']

export function profileKey(userId: string) {
  return ['profile', userId] as const
}

export function useProfile() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: profileKey(userId ?? 'signed-out'),
    enabled: userId !== null,
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
