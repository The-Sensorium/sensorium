import { useQuery } from '@tanstack/react-query'
import type { Database } from '../lib/database.types'
import { requireSupabase, type MatchingMode } from '../lib/supabase'

/**
 * One cluster shown in the public discovery directory. Only non-sensitive
 * fields (name, mode, status, member count) leak past RLS via the
 * security-definer RPC — introductions, messages, and membership stay private.
 */
export type ClusterTile =
  Database['public']['Functions']['get_clusters_by_mode']['Returns'][number]

/** Global, per-mode count of non-archived clusters, for the discovery grid. */
export function usePublicClusterCounts() {
  return useQuery({
    queryKey: ['public-cluster-counts'],
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_public_cluster_counts')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Public directory of non-archived clusters in a single mode. */
export function useClustersByMode(mode: MatchingMode | null) {
  return useQuery({
    queryKey: ['clusters-by-mode', mode ?? 'none'],
    enabled: mode !== null,
    staleTime: 30_000,
    queryFn: async () => {
      if (!mode) throw new Error('No mode')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_clusters_by_mode', { p_mode: mode })
      if (error) throw error
      return (data ?? []) as ClusterTile[]
    },
  })
}