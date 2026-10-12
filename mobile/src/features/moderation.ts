import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth-context'
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

export function toggleRevealedId(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
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

export type DeleteAccountStorageResult = {
  ok: boolean
  deleted: number
  error?: string
}

/** Delete the signed-in user's account (cascades to all owned rows). Storage
 * objects live outside the database cascade, and the member-scoped delete
 * policies cannot reach objects in clusters the user has already left, so
 * physical cleanup runs through the delete-account-storage edge function: it
 * verifies the caller's JWT, lists every object the account owns (avatar, chat
 * images, post and comment images) server-side, and deletes them under the
 * service-role key. Only a fully successful cleanup lets the account RPC run;
 * any failure aborts so a retry re-runs the same idempotent deletion. An
 * account with nothing stored skips the edge function, so a missing function
 * deployment cannot block deleting an account that has no media. */
export function useDeleteAccount() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()

      const { data: owned, error: ownedError } = await supabase.rpc('get_my_storage_objects')
      const nothingStored = !ownedError && Array.isArray(owned) && owned.length === 0
      if (!nothingStored) {
        const { data, error } = await supabase.functions.invoke<DeleteAccountStorageResult>(
          'delete-account-storage',
        )
        if (error) throw new Error(error instanceof Error ? error.message : 'Storage cleanup failed')
        if (!data?.ok) throw new Error(data?.error ?? 'Storage cleanup failed')
      }

      const { error: delError } = await supabase.rpc('delete_my_account')
      if (delError) throw delError
      // The account row is already gone. The auth-js client always posts a
      // /logout request regardless of scope and treats the resulting 401/403/404
      // as benign, clearing the local session either way; local scope additionally
      // ends only this device's session instead of broadcasting a global sign-out
      // for a user that no longer exists.
      await supabase.auth.signOut({ scope: 'local' })
      queryClient.clear()
    },
  })
}
