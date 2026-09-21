import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

export type Signal = Database['public']['Tables']['signals']['Row']
export type SignalReply = Database['public']['Tables']['signal_replies']['Row']
export type SignalStatus = Database['public']['Enums']['signal_status']

/** All signals in a cluster (RLS: active members), newest first. */
export function useClusterSignals(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['cluster-signals', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Signal[]
    },
  })
}

/**
 * Replies for a signal (detail) or for the whole cluster (list reply counts).
 * `signalId` null → every reply in the cluster via its cluster_id column.
 */
export function useSignalReplies(
  clusterId: string | null,
  signalId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['signal-replies', clusterId ?? 'none', signalId ?? 'all'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      if (signalId) {
        const { data, error } = await supabase
          .from('signal_replies')
          .select('*')
          .eq('signal_id', signalId)
          .order('created_at', { ascending: true })
        if (error) throw error
        return (data ?? []) as SignalReply[]
      }
      const { data, error } = await supabase
        .from('signal_replies')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as SignalReply[]
    },
  })
}

export type SignalReplyCount = { signal_id: string; reply_count: number }

/** Per-signal reply counts (bounded GROUP BY; RLS: active members). List views
 * rank/badge from this instead of downloading every reply row. */
export function useSignalReplyCounts(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['signal-reply-counts', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_signal_reply_counts', {
        p_cluster_id: clusterId,
      })
      if (error) throw error
      return (data ?? []) as SignalReplyCount[]
    },
  })
}

export function useRaiseSignal(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (prompt: string) => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('raise_signal', {
        p_cluster_id: clusterId,
        p_prompt: prompt,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-signals', clusterId] })
      }
    },
  })
}

export function useReplySignal(clusterId: string | null, signalId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (content: string) => {
      if (!signalId) throw new Error('No signal')
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('reply_signal', {
        p_signal_id: signalId,
        p_content: content,
      })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({
          queryKey: ['signal-replies', clusterId, signalId ?? 'all'],
        })
        void queryClient.invalidateQueries({ queryKey: ['signal-replies', clusterId, 'all'] })
        void queryClient.invalidateQueries({ queryKey: ['signal-reply-counts', clusterId] })
      }
    },
  })
}

export function useSetSignalStatus(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ signalId, status }: { signalId: string; status: SignalStatus }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('set_signal_status', {
        p_signal_id: signalId,
        p_status: status,
      })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-signals', clusterId] })
      }
    },
  })
}

export const SIGNAL_STATUS_ORDER: SignalStatus[] = ['open', 'in_progress', 'resolved']
