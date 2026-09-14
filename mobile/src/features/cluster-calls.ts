import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

export type Call = Database['public']['Tables']['calls']['Row']
export type CallParticipant = Database['public']['Tables']['call_participants']['Row']

export const MAX_CALL_PARTICIPANTS = 8
export const CALL_TOKEN_FUNCTION = 'create-call-token'
export const CALL_TOKEN_STALE_MS = 8 * 60 * 1000
/** Show the "time left" warning inside the last five minutes of a call. */
export const CALL_WARNING_SECONDS = 5 * 60

/**
 * The LiveKit room for a cluster call: unique per call so a lingering connection
 * from a previous call in the same cluster can't appear in a new one. Mirrored
 * by the create-call-token Edge Function and the web app.
 */
export function buildCallRoomName(clusterId: string, callId: string): string {
  return `cluster:${clusterId}:${callId}`
}

/** The cluster's live call (ringing or active), if any. Ended calls stay hidden. */
export function useActiveCall(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['active-call', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('cluster_id', clusterId)
        .in('status', ['ringing', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return ((data ?? []) as Call[])[0] ?? null
    },
  })
}

/** A single call by id (for the call screen's timer / ended state). */
export function useCall(callId: string | null) {
  return useQuery({
    queryKey: ['call', callId ?? 'none'],
    enabled: callId !== null,
    queryFn: async () => {
      if (!callId) throw new Error('No call')
      const supabase = requireSupabase()
      const { data, error } = await supabase.from('calls').select('*').eq('id', callId).maybeSingle()
      if (error) throw error
      return (data as Call | null) ?? null
    },
  })
}

/** Who has joined a call and not left. */
export function useCallParticipants(callId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['call-participants', callId ?? 'none'],
    enabled: enabled && callId !== null,
    queryFn: async () => {
      if (!callId) throw new Error('No call')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('call_participants')
        .select('*')
        .eq('call_id', callId)
        .is('left_at', null)
      if (error) throw error
      return (data ?? []) as CallParticipant[]
    },
  })
}

function invalidateCall(queryClient: ReturnType<typeof useQueryClient>, clusterId: string, callId?: string) {
  void queryClient.invalidateQueries({ queryKey: ['active-call', clusterId] })
  if (callId) void queryClient.invalidateQueries({ queryKey: ['call-participants', callId] })
}

/** Start a call, or return the live one if the cluster already has it. */
export function useStartCall(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('start_call', { p_cluster_id: clusterId })
      if (error) throw error
      return data as string
    },
    onSuccess: (callId) => {
      if (clusterId) invalidateCall(queryClient, clusterId, callId)
    },
  })
}

/** Join a live call as the current user. */
export function useJoinCall(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (callId: string) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('join_call', { p_call_id: callId })
      if (error) throw error
      return data as string
    },
    onSuccess: (callId) => {
      if (clusterId) invalidateCall(queryClient, clusterId, callId)
    },
  })
}

/** Leave a call. Only the caller leaves; the call ends when the last person does. */
export function useLeaveCall(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (callId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('leave_call', { p_call_id: callId })
      if (error) throw error
    },
    onSuccess: (_, callId) => {
      if (clusterId) invalidateCall(queryClient, clusterId, callId)
    },
  })
}

export interface CallToken {
  token: string
  url: string
}

/**
 * A short-lived LiveKit token for a call, minted by the create-call-token Edge
 * Function after it re-checks membership. Fetched only when the user opts into
 * a call, never speculatively.
 */
export function useCallToken(callId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['call-token', callId ?? 'none'],
    enabled: enabled && callId !== null,
    staleTime: CALL_TOKEN_STALE_MS,
    queryFn: async () => {
      if (!callId) throw new Error('No call')
      const supabase = requireSupabase()
      const { data, error } = await supabase.functions.invoke<CallToken>(CALL_TOKEN_FUNCTION, {
        body: { call_id: callId },
      })
      if (error) throw error
      if (!data?.token || !data?.url) throw new Error('No token')
      return data
    },
  })
}
