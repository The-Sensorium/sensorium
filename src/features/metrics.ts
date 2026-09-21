import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

export type MetricsOverview = Database['public']['Functions']['get_metrics_overview']['Returns'][number]
export type RetentionRow = Database['public']['Functions']['get_retention']['Returns'][number]
export type ModeBreakdownRow = Database['public']['Functions']['get_mode_breakdown']['Returns'][number]
export type ClusterActivityRow = Database['public']['Functions']['get_cluster_activity']['Returns'][number]

// Success-metrics telemetry is a daily batch (pg_cron rollup at 03:00 UTC),
// so a long stale time is correct: only the daily-active count moves intraday,
// and it refreshes on remount after 12h. No realtime subscriptions.
const STALE_TIME = 12 * 60 * 60 * 1000

function useAdminUserId() {
  const auth = useAuth()
  return auth.state === 'signedIn' ? auth.userId : null
}

export function useMetricsOverview(enabled = true) {
  const userId = useAdminUserId()
  return useQuery({
    queryKey: ['metrics-overview', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_metrics_overview')
      if (error) throw error
      if (!data?.[0]) throw new Error('No metrics available')
      return data[0]
    },
  })
}

export function useRetention(enabled = true) {
  const userId = useAdminUserId()
  return useQuery({
    queryKey: ['metrics-retention', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_retention')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useModeBreakdown(enabled = true) {
  const userId = useAdminUserId()
  return useQuery({
    queryKey: ['metrics-modes', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_mode_breakdown')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useClusterActivity(limit = 50, enabled = true) {
  const userId = useAdminUserId()
  return useQuery({
    queryKey: ['metrics-activity', userId ?? 'signed-out', limit],
    enabled: enabled && userId !== null,
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_cluster_activity', { p_limit: limit })
      if (error) throw error
      return data ?? []
    },
  })
}
