import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export function isMutedAuthor(muted: Set<string>, authorId: string): boolean {
  return muted.has(authorId)
}

export type MutedUser = Database['public']['Functions']['get_my_mutes']['Returns'][number]

export function useMyMutes(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['my-mutes', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_my_mutes')
      if (error) throw error
      return (data ?? []) as MutedUser[]
    },
  })
}

export function mutedIds(mutes: MutedUser[] | undefined): Set<string> {
  return new Set((mutes ?? []).map((m) => m.muted_user_id))
}

export function useIsMuted(userId: string | null | undefined): boolean {
  const mutes = useMyMutes(userId != null)
  if (!userId) return false
  return (mutes.data ?? []).some((m) => m.muted_user_id === userId)
}

export function useMuteUser() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ targetUserId }: { targetUserId: string; displayName?: string }) => {
      if (!userId) throw new Error('Not signed in')
      if (targetUserId === userId) throw new Error('cannot_mute_self')
      const supabase = requireSupabase()
      const { error } = await supabase.from('user_mutes').insert({ user_id: userId, muted_user_id: targetUserId })
      if (error && error.code !== '23505') throw error
    },
    onMutate: async ({ targetUserId, displayName }) => {
      const key = ['my-mutes', userId ?? 'signed-out']
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<MutedUser[]>(key)
      queryClient.setQueryData<MutedUser[]>(key, (existing) =>
        existing && existing.some((m) => m.muted_user_id === targetUserId)
          ? existing
          : [
              ...(existing ?? []),
              { muted_user_id: targetUserId, display_name: displayName ?? '', avatar_url: '' },
            ],
      )
      return { previous }
    },
    onError: (_e, _v, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['my-mutes', userId ?? 'signed-out'], context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-mutes', userId ?? 'signed-out'] })
    },
  })
}

export function useUnmuteUser() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ targetUserId }: { targetUserId: string }) => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { error } = await supabase.from('user_mutes').delete().eq('user_id', userId).eq('muted_user_id', targetUserId)
      if (error) throw error
    },
    onMutate: async ({ targetUserId }) => {
      const key = ['my-mutes', userId ?? 'signed-out']
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<MutedUser[]>(key)
      queryClient.setQueryData<MutedUser[]>(key, (existing) =>
        (existing ?? []).filter((m) => m.muted_user_id !== targetUserId),
      )
      return { previous }
    },
    onError: (_e, _v, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['my-mutes', userId ?? 'signed-out'], context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-mutes', userId ?? 'signed-out'] })
    },
  })
}

export type MyReport = Database['public']['Functions']['get_my_reports_v2']['Returns'][number]

export function useMyReports(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['my-reports', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_my_reports_v2')
      if (error) throw error
      return (data ?? []) as MyReport[]
    },
  })
}

/** Report a member of a cluster (validated server-side; rejects self-reports). */
export function useReportMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clusterId,
      targetUserId,
      reason,
      details,
      messageId,
    }: {
      clusterId: string
      targetUserId: string
      reason: ReportReason
      details?: string
      messageId?: string
    }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('report_member', {
        p_cluster_id: clusterId,
        p_target_user_id: targetUserId,
        p_reason: reason,
        p_details: details ?? undefined,
        p_message_id: messageId ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      void queryClient.invalidateQueries({ queryKey: ['my-reports'] })
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
