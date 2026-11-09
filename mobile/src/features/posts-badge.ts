import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth-context'
import { requireSupabase } from '../lib/supabase'
import { getPostsSeenAt, markPostsSeen } from '../lib/posts-seen'

const NEW_POSTS_KEY = ['posts', 'new-count'] as const

/** Posts created since the caller last opened the Posts tab, excluding their
 * own posts. The watermark is device-local: opening Posts clears the badge on
 * this device only. RLS scopes the count to active members of unlocked
 * clusters, and hides deleted or moderation-hidden posts. */
export function useNewPostsCount(clusterIds: string[]) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const ids = [...clusterIds].sort()
  const key = ids.join(',')

  return useQuery({
    queryKey: [...NEW_POSTS_KEY, userId ?? 'signed-out', key],
    enabled: userId !== null && ids.length > 0,
    // Same realtime + focus/reconnect strategy as the notification badge, with
    // the same background-paused healing poll.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!userId) return 0
      const seenAt = await getPostsSeenAt(userId)
      const supabase = requireSupabase()
      const { count, error } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .in('cluster_id', ids)
        .gt('created_at', seenAt)
        .neq('author_id', userId)
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Advance the device-local Posts watermark and refresh the tab badge. */
export function useMarkPostsSeen() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useCallback(async () => {
    if (!userId) return
    await markPostsSeen(userId).catch(() => undefined)
    void queryClient.invalidateQueries({ queryKey: NEW_POSTS_KEY })
  }, [userId, queryClient])
}
