import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth-context'
import { requireSupabase } from '../lib/supabase'
import { getPostsSeenAt, markPostsSeen } from '../lib/posts-seen'

const NEW_POSTS_KEY = ['posts', 'new-count'] as const

/** New posts per cluster since that cluster was last opened on this device,
 * excluding the caller's own posts. Missing entries mean zero. The watermarks
 * are device-local, so opening one cluster leaves the others badgeable.
 * RLS scopes the counts to active members of unlocked clusters, and hides
 * deleted or moderation-hidden posts. */
export function useNewPostsCounts(clusterIds: string[]) {
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
      const counts = new Map<string, number>()
      if (!userId) return counts
      const supabase = requireSupabase()
      // One HEAD count per cluster keeps each request bounded and avoids
      // downloading every post since the oldest watermark.
      const rows = await Promise.all(
        ids.map(async (clusterId) => {
          const seenAt = await getPostsSeenAt(userId, clusterId)
          const { count, error } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('cluster_id', clusterId)
            .gt('created_at', seenAt)
            .neq('author_id', userId)
          if (error) throw error
          return [clusterId, count ?? 0] as const
        }),
      )
      for (const [clusterId, count] of rows) counts.set(clusterId, count)
      return counts
    },
  })
}

/** Advance one cluster's device-local Posts watermark and refresh the badges. */
export function useMarkPostsSeen() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useCallback(async (clusterId: string) => {
    if (!userId) return
    await markPostsSeen(userId, clusterId).catch(() => undefined)
    void queryClient.invalidateQueries({ queryKey: NEW_POSTS_KEY })
  }, [userId, queryClient])
}
