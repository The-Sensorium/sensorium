import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

export type Vote = Database['public']['Tables']['votes']['Row']
export type VoteResponse = Database['public']['Tables']['vote_responses']['Row']
export type ReplacementRound = Database['public']['Functions']['get_replacement_round']['Returns'][number]
export type CandidateProfile = Database['public']['Functions']['get_candidate_profiles']['Returns'][number]
export type PendingInvitation = Database['public']['Functions']['get_pending_invitations']['Returns'][number]

/** All votes in a cluster (RLS: active members), newest first. */
export function useClusterVotes(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['cluster-votes', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Vote[]
    },
  })
}

/** Every vote_response on this cluster's votes (used to show the caller's own choice). */
export function useClusterVoteResponses(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['vote-responses', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data: votes, error: vErr } = await supabase
        .from('votes')
        .select('id')
        .eq('cluster_id', clusterId)
      if (vErr) throw vErr
      const ids = (votes ?? []).map((v) => v.id)
      if (ids.length === 0) return [] as VoteResponse[]
      const { data, error } = await supabase
        .from('vote_responses')
        .select('*')
        .in('vote_id', ids)
      if (error) throw error
      return (data ?? []) as VoteResponse[]
    },
  })
}

/** The cluster's active replacement round, if any (RLS: active members). */
export function useReplacementRound(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['replacement-round', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_replacement_round', {
        p_cluster_id: clusterId,
      })
      if (error) throw error
      return (data?.[0] as ReplacementRound | undefined) ?? null
    },
  })
}

/** Profile cards for a round's candidate pool (security definer RPC). */
export function useReplacementCandidates(roundId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['replacement-candidates', roundId ?? 'none'],
    enabled: enabled && roundId !== null,
    queryFn: async () => {
      if (!roundId) throw new Error('No round')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_candidate_profiles', {
        p_round_id: roundId,
      })
      if (error) throw error
      return (data ?? []) as CandidateProfile[]
    },
  })
}

export function useStartReplaceVote(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (targetMemberId: string) => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('start_replace_vote', {
        p_cluster_id: clusterId,
        p_target_member_id: targetMemberId,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-votes', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['vote-responses', clusterId] })
      }
    },
  })
}

export function useStartNameVote(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('start_name_vote', {
        p_cluster_id: clusterId,
        p_name: name,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-votes', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['vote-responses', clusterId] })
      }
    },
  })
}

/** Cast (or change) the caller's vote on an open vote. */
export function useVoteOn(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ voteId, choice }: { voteId: string; choice: string }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('vote_on', {
        p_vote_id: voteId,
        p_choice: choice,
      })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['vote-responses', clusterId] })
      }
    },
  })
}

/** The signed-in user's pending cluster invitations (polled; invite is rare). */
export function useMyPendingInvitations(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['my-invitations', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    refetchInterval: 30_000,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_pending_invitations')
      if (error) throw error
      return (data ?? []) as PendingInvitation[]
    },
  })
}

export function useAcceptInvitation() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('accept_invitation', {
        p_invitation_id: invitationId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-invitations'] })
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['my-clusters', userId] })
        void queryClient.invalidateQueries({ queryKey: ['matching-status', userId] })
      }
    },
  })
}

export function useDeclineInvitation() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('decline_invitation', {
        p_invitation_id: invitationId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-invitations'] })
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['matching-status', userId] })
      }
    },
  })
}

export interface VoteResult {
  outcome: string
  yes: number
  no: number
  cast: number
  quorum: number
  name?: string
}

/** Parse the `result` jsonb that `close_expired_votes` writes onto closed votes. */
export function parseVoteResult(result: Vote['result']): VoteResult | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const r = result as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' ? v : 0)
  const outcome = typeof r.outcome === 'string' ? r.outcome : 'unknown'
  const name = typeof r.name === 'string' ? r.name : undefined
  return {
    outcome,
    yes: num(r.yes),
    no: num(r.no),
    cast: num(r.cast),
    quorum: num(r.quorum),
    name,
  }
}
