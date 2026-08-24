import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

type NotificationRow = Database['public']['Tables']['notifications']['Row']
type NotificationPrefsRow = Database['public']['Tables']['notification_prefs']['Row']
export type NotificationType = Database['public']['Enums']['notification_type']
export type MyNotification = Database['public']['Functions']['get_my_notifications']['Returns'][number]
export type NotificationPrefs = NotificationPrefsRow

/** The caller's notifications, newest first, already filtered by their prefs. */
export function useMyNotifications(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['notifications', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    refetchInterval: 30_000,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_my_notifications')
      if (error) throw error
      return (data ?? []) as MyNotification[]
    },
  })
}

/** Unread count after prefs filtering (header badge). Includes unread chat. */
export function useUnreadCount(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['notifications', 'unread', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    refetchInterval: 30_000,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_unread_notification_count')
      if (error) throw error
      return (data ?? 0) as number
    },
  })
}

function useNotificationsQueryKeys() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  return userId ? (['notifications', userId] as const) : null
}

/** Mark a single notification read (RLS: own row). */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  const key = useNotificationsQueryKeys()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
      if (error) throw error
    },
    onSuccess: () => {
      if (key) {
        void queryClient.invalidateQueries({ queryKey: key })
        void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
      }
    },
  })
}

/** Mark all of the caller's notifications read, plus chat in every cluster. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('mark_all_read')
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    },
  })
}

/**
 * Mark the caller's chat read in one cluster (advances last_read_message_at).
 * Chat is surfaced in the notifications center as synthesized `message` entries
 * (migration 0051), so advancing the watermark must refresh that list too.
 */
export function useMarkClusterRead() {
  const queryClient = useQueryClient()
  const key = useNotificationsQueryKeys()

  return useMutation({
    mutationFn: async (clusterId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('mark_cluster_read', { p_cluster_id: clusterId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
      if (key) void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

/** The caller's notification prefs across all clusters (RLS: own rows). */
export function useNotificationPrefs(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['notification-prefs', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('*')
        .eq('user_id', userId)
      if (error) throw error
      return (data ?? []) as NotificationPrefsRow[]
    },
  })
}

export type PrefToggle =
  | 'messages'
  | 'mentions'
  | 'reactions'
  | 'votes'
  | 'invitations'
  | 'signals'
  | 'post_comment'
  | 'post_like'

export const PREF_TOGGLES: PrefToggle[] = [
  'messages',
  'mentions',
  'reactions',
  'votes',
  'invitations',
  'signals',
  'post_comment',
  'post_like',
]

export const PREF_LABELS: Record<PrefToggle, string> = {
  messages: 'Messages',
  mentions: 'Mentions',
  reactions: 'Reactions',
  votes: 'Votes & replacements',
  invitations: 'Invitations',
  signals: 'Signals',
  post_comment: 'Comments & replies',
  post_like: 'Likes',
}

/** Upsert the caller's prefs for one cluster; re-reads notifications (prefs filter the list). */
export function useUpsertNotificationPrefs() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clusterId,
      toggles,
    }: {
      clusterId: string
      toggles: Partial<Record<PrefToggle, boolean>>
    }) => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { error } = await supabase
        .from('notification_prefs')
        .upsert({ user_id: userId, cluster_id: clusterId, ...toggles }, { onConflict: 'user_id,cluster_id' })
      if (error) throw error
    },
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['notification-prefs', userId] })
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
      }
    },
  })
}

/**
 * Subscribes to the signed-in user's realtime channel (docs 04 §1): notification
 * INSERT bumps the badge + list; invitation INSERT refreshes the Home banner.
 * Mount once in the app shell.
 */
export function useNotificationsChannel(userId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    const supabase = requireSupabase()

    const channel = supabase
      .channel(`user:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
          void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'invitations', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['my-invitations'] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}

/** Where a notification should deep-link when tapped (null = no navigation). */
export function notificationTarget(
  n: MyNotification | NotificationRow,
): { to: string } | null {
  const clusterId = n.cluster_id
  const payload = (n.payload ?? {}) as Record<string, unknown>
  const signalId = typeof payload.signal_id === 'string' ? payload.signal_id : null
  const postId = typeof payload.post_id === 'string' ? payload.post_id : null

  switch (n.type) {
    case 'post_comment':
    case 'post_like':
      return postId ? { to: `/posts/${postId}` } : clusterId ? { to: `/cluster/${clusterId}` } : null
    case 'message':
    case 'mention':
    case 'reaction':
    case 'unlocked':
      return clusterId ? { to: `/cluster/${clusterId}` } : null
    case 'signal_new':
      return clusterId && signalId ? { to: `/cluster/${clusterId}/signals/${signalId}` } : clusterId ? { to: `/cluster/${clusterId}/signals` } : null
    case 'vote_started':
    case 'vote_result':
    case 'replacement':
      return clusterId ? { to: `/cluster/${clusterId}/votes` } : null
    case 'invitation_received':
      return { to: '/home' }
    case 'cluster_formed':
      return clusterId ? { to: `/cluster/${clusterId}/introductions` } : { to: '/home' }
    case 'queue_update':
      return { to: '/clusters' }
    default:
      return clusterId ? { to: `/cluster/${clusterId}` } : null
  }
}

const timeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** Compact relative time, e.g. "2h ago", for notification cards. */
export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return timeFormatter.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return timeFormatter.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 30) return timeFormatter.format(-days, 'day')
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
