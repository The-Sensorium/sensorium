import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

export type ReportReason = Database['public']['Enums']['report_reason']

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate_content', label: 'Inappropriate Content' },
  { value: 'other', label: 'Other' },
]

/** Report a member of a cluster (validated server-side; rejects self-reports). */
export function useReportMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clusterId,
      targetUserId,
      reason,
      details,
    }: {
      clusterId: string
      targetUserId: string
      reason: ReportReason
      details?: string
    }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('report_member', {
        p_cluster_id: clusterId,
        p_target_user_id: targetUserId,
        p_reason: reason,
        p_details: details ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

/** Delete the signed-in user's account (cascades to all owned rows). */
export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
      await supabase.auth.signOut()
      queryClient.clear()
    },
  })
}
