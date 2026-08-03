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
 * `signalId` null → every reply in the cluster (lookup via signal ids).
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
      const { data: signals, error: sErr } = await supabase
        .from('signals')
        .select('id')
        .eq('cluster_id', clusterId)
      if (sErr) throw sErr
      const ids = (signals ?? []).map((s) => s.id)
      if (ids.length === 0) return [] as SignalReply[]
      const { data, error } = await supabase
        .from('signal_replies')
        .select('*')
        .in('signal_id', ids)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as SignalReply[]
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
