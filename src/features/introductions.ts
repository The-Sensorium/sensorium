import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

type Cluster = Database['public']['Tables']['clusters']['Row']
export type IntroProgressRow = Database['public']['Functions']['get_intro_progress']['Returns'][number]
export type IntroQuestion = Database['public']['Functions']['get_intro_questions']['Returns'][number]

/** Reads a cluster row (RLS: caller must be an active member). */
export function useCluster(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['cluster', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('clusters')
        .select('*')
        .eq('id', clusterId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as Cluster | null
    },
  })
}

/** The signed-in user's membership row in a cluster (intro_completed_at, joined_at). */
export function useMyMembership(clusterId: string | null, enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['cluster-membership', clusterId ?? 'none', userId ?? 'signed-out'],
    enabled: enabled && clusterId !== null && userId !== null,
    queryFn: async () => {
      if (!clusterId || !userId) throw new Error('No cluster or user')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('cluster_members')
        .select('cluster_id, user_id, joined_at, intro_completed_at')
        .eq('cluster_id', clusterId)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data ?? null
    },
  })
}

export function useIntroQuestions(enabled = true) {
  return useQuery({
    queryKey: ['intro-questions'],
    enabled,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_intro_questions')
      if (error) throw error
      return (data ?? []) as IntroQuestion[]
    },
  })
}

/** Who has/hasn't completed their intro. Polls every 10s (no realtime channel yet in M6). */
export function useIntroProgress(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['intro-progress', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_intro_progress', { p_cluster_id: clusterId })
      if (error) throw error
      return (data ?? []) as IntroProgressRow[]
    },
  })
}

export function useSubmitIntroAnswers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clusterId, answers }: { clusterId: string; answers: Record<number, string> }) => {
      const supabase = requireSupabase()
      const payload = Object.entries(answers).map(([questionId, answer]) => ({
        question_id: Number(questionId),
        answer,
      }))
      const { error } = await supabase.rpc('submit_intro_answers', {
        p_cluster_id: clusterId,
        p_answers: payload,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['intro-progress', variables.clusterId] })
      void queryClient.invalidateQueries({ queryKey: ['cluster-membership', variables.clusterId] })
      void queryClient.invalidateQueries({ queryKey: ['cluster', variables.clusterId] })
      void queryClient.invalidateQueries({ queryKey: ['my-clusters'] })
    },
  })
}
