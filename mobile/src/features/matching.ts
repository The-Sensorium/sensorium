import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase, type MatchingMode } from '../lib/supabase'

type Cluster = Database['public']['Tables']['clusters']['Row']
export type MatchingStatus = Database['public']['Functions']['get_my_matching_status']['Returns'][number]

export function useMyQueueStatus(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['matching-status', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    // Single fetch per mount window: join/leave mutations invalidate
    // explicitly, so a short stale time avoids refetch storms on remount.
    staleTime: 30_000,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_my_matching_status')
      if (error) throw error
      return data ?? []
    },
  })
}

export interface MyQueueEntry {
  mode: MatchingMode
  queue_key: string
  waiting: number
}

export function useMyQueueKeys(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['my-queues', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_my_queue_keys')
      if (error) throw error
      return (data ?? []) as MyQueueEntry[]
    },
  })
}

export interface MyCluster {
  cluster: Cluster
  joinedAt: string
  memberCount: number
}

export function useMyClusters(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['my-clusters', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()

      // DB-side count via security-definer RPC (avoids a full-table scan of
      // cluster_members that the previous client-side aggregate performed).
      const { data, error } = await supabase.rpc('get_my_clusters')
      if (error) throw error

      return (data ?? []).map((row) => ({
        cluster: {
          id: row.id,
          name: row.name,
          matching_mode: row.matching_mode,
          mode_label: row.mode_label,
          queue_key: row.queue_key,
          status: row.status,
          introductions_deadline: row.introductions_deadline,
          introductions_completed_at: row.introductions_completed_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        } as Cluster,
        joinedAt: row.joined_at,
        memberCount: row.member_count,
      }))
    },
  })
}

export function useClusterMembers(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['cluster-members', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_member_profiles', { p_cluster_id: clusterId })
      if (error) throw error
      // get_member_profiles has no ORDER BY, so Postgres may return rows in a
      // different order on every refetch (read receipts invalidate this query
      // constantly). Sort client-side so the presence strip never reshuffles.
      return [...(data ?? [])].sort(
        (a, b) =>
          (a.display_name ?? '').localeCompare(b.display_name ?? '', undefined, {
            sensitivity: 'base',
          }) || String(a.id).localeCompare(String(b.id)),
      )
    },
  })
}

/** Waiting count for a queue, polled at a low frequency. There is no live
 * broadcast sender for queue counts (maybe_form_cluster uses Postgres
 * pg_notify, which never reaches Supabase Realtime Broadcast), so the poll is
 * the live path: 60s interval, paused in background tabs, with focus/reconnect
 * refetch. Same-key mounts share one query via TanStack dedup. */
export function useQueueCount(mode: MatchingMode, queueKey: string | null) {
  const query = useQuery({
    queryKey: ['queue-count', mode, queueKey ?? 'none'],
    enabled: queueKey !== null,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    queryFn: async () => {
      if (!queueKey) return 0
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_queue_count', {
        p_mode: mode,
        p_queue_key: queueKey,
      })
      if (error) throw error
      return data ?? 0
    },
  })

  return {
    count: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useJoinQueue() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      mode,
      radiusKm,
    }: {
      mode: MatchingMode
      radiusKm?: number
    }) => {
      const supabase = requireSupabase()
      const args = { p_mode: mode } as { p_mode: MatchingMode; p_radius_km?: number }
      if (radiusKm !== undefined) args.p_radius_km = radiusKm
      const { data, error } = await supabase.rpc('join_queue', args)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['my-queues', userId] })
        void queryClient.invalidateQueries({ queryKey: ['matching-status', userId] })
      }
    },
  })
}

export function useLeaveQueue() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (mode: MatchingMode) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('leave_queue', { p_mode: mode })
      if (error) throw error
    },
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['my-queues', userId] })
        void queryClient.invalidateQueries({ queryKey: ['matching-status', userId] })
      }
    },
  })
}

export interface ClusterFormedNotification {
  id: string
  cluster_id: string | null
  payload: Record<string, unknown> | null
}

/** Latest unread `cluster_formed` notification, for the Home banner + /cluster-created. */
export function useLatestClusterFormed(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['cluster-formed', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('notifications')
        .select('id, cluster_id, payload')
        .eq('user_id', userId)
        .eq('type', 'cluster_formed')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] as ClusterFormedNotification | undefined) ?? null
    },
  })
}
