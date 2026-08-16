import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'
import { deleteAvatarObject } from './avatars'
import { deleteChatImage } from './cluster'

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

/** Delete the signed-in user's account (cascades to all owned rows). Storage
 * objects live outside the database cascade, so the user's avatar and every
 * chat image they authored are reclaimed up front (owner/member-scoped deletes,
 * migration 0050) before the account row is removed. This ordering is required:
 * delete_my_account departs the user from every cluster first, and the
 * chat-images delete policy demands active membership, so reclamation would be
 * blocked if it ran after the RPC. */
export function useDeleteAccount() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()

      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .maybeSingle()
      await deleteAvatarObject(profile?.avatar_url ?? null).catch(() => {})

      const { data: images } = await supabase
        .from('messages')
        .select('image_url')
        .eq('author_id', userId)
        .not('image_url', 'is', null)
      for (const row of images ?? []) {
        await deleteChatImage(row.image_url).catch(() => {})
      }

      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
      await supabase.auth.signOut()
      queryClient.clear()
    },
  })
}
