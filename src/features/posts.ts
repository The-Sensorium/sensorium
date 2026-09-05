import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'
import { prepareImage } from '../lib/image'

export type Post = Database['public']['Tables']['posts']['Row']
export type PostComment = Database['public']['Tables']['post_comments']['Row']
export type PostLike = Database['public']['Tables']['post_likes']['Row']
export type CommentLike = Database['public']['Tables']['comment_likes']['Row']

export const POSTS_PAGE_SIZE = 30
export const POST_CONTENT_MAX = 2000
export const POST_TITLE_MAX = 200
export const COMMENT_CONTENT_MAX = 1000

const byNewest = (a: Post, b: Post) =>
  b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
const byOldest = (a: PostComment, b: PostComment) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

export type PostSort = 'new' | 'top'

/** Reorder a loaded feed slice for display. "top" ranks a post by likes + comments
 * (client-side: the data is already fetched) and falls back to newest on ties. */
export function sortPostsForFeed(
  posts: Post[],
  sort: PostSort,
  engagement: (post: Post) => { likes: number; comments: number },
): Post[] {
  if (sort === 'new') return posts
  return [...posts].sort((a, b) => {
    const rank = (p: Post) => {
      const e = engagement(p)
      return e.likes + e.comments
    }
    const diff = rank(b) - rank(a)
    return diff !== 0 ? diff : byNewest(a, b)
  })
}

/** Posts of one cluster, newest first (RLS: active members of an unlocked cluster).
 * A refetch returns the newest page but merge-preserves any earlier pages already
 * loaded via useLoadEarlierPosts, so cache invalidations don't truncate the feed.
 * Posts inside the freshly-fetched window that are no longer returned (soft-deleted
 * or moderation-hidden, so RLS hides them) are pruned instead of resurrected. */
export function useClusterPosts(clusterId: string | null, enabled = true) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['cluster-posts', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(POSTS_PAGE_SIZE)
      if (error) throw error
      const fresh = ((data ?? []) as Post[]).sort(byNewest)
      if (fresh.length === 0) return fresh
      const freshIds = new Set(fresh.map((p) => p.id))
      const cutoff = fresh[fresh.length - 1]
      const existing = queryClient.getQueryData<Post[]>(['cluster-posts', clusterId]) ?? []
      const byId = new Map<string, Post>()
      for (const p of existing) {
        // Posts older than the fresh page live in an earlier page; keep them (we
        // cannot tell from this fetch whether they still exist). Posts at/after the
        // cutoff must appear in fresh; if they don't, RLS no longer returns them.
        if (byNewest(p, cutoff) <= 0 && !freshIds.has(p.id)) continue
        byId.set(p.id, p)
      }
      for (const p of fresh) byId.set(p.id, p)
      return [...byId.values()].sort(byNewest)
    },
  })
}

/** Load one earlier page of posts and append it to the feed (dedupe by id). */
export function useLoadEarlierPosts(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<{ added: number; hasMore: boolean }> => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const key: ['cluster-posts', string] = ['cluster-posts', clusterId]
      const current = queryClient.getQueryData<Post[]>(key) ?? []
      const oldest = current[current.length - 1]
      let query = supabase
        .from('posts')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(POSTS_PAGE_SIZE)
      if (oldest)
        query = query.or(
          `created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`,
        )
      const { data, error } = await query
      if (error) throw error
      const older = ((data ?? []) as Post[]).sort(byNewest)
      queryClient.setQueryData<Post[]>(key, (existing) => {
        const byId = new Map<string, Post>()
        for (const p of [...(existing ?? current), ...older]) byId.set(p.id, p)
        return [...byId.values()].sort(byNewest)
      })
      const added = older.filter((p) => !current.some((c) => c.id === p.id)).length
      return { added, hasMore: added === POSTS_PAGE_SIZE }
    },
  })
}

/** A single post by id (RLS: caller must be an active member of its cluster). */
export function usePost(postId: string | null) {
  return useQuery({
    queryKey: ['cluster-posts', 'single', postId ?? 'none'],
    enabled: postId !== null,
    queryFn: async () => {
      if (!postId) throw new Error('No post')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as Post | null
    },
  })
}

export const RECENT_POSTS_LIMIT = 5

/** Recent posts across the caller's clusters, newest first (RLS scopes it).
 * Home preview only; the Posts page remains the full per-cluster experience. */
export function useRecentClusterPosts(clusterIds: string[], limit = RECENT_POSTS_LIMIT) {
  const key = [...clusterIds].sort().join(',')
  return useQuery({
    queryKey: ['recent-posts', key, limit],
    enabled: clusterIds.length > 0,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .in('cluster_id', clusterIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (error) throw error
      return ((data ?? []) as Post[]).sort(byNewest)
    },
  })
}

/** Posts authored by a user across clusters the caller can see (RLS scopes it). */
export function useUserPosts(authorId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['user-posts', authorId ?? 'none'],
    enabled: enabled && authorId !== null,
    queryFn: async () => {
      if (!authorId) throw new Error('No author')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(POSTS_PAGE_SIZE)
      if (error) throw error
      return ((data ?? []) as Post[]).sort(byNewest)
    },
  })
}

/** Likes on the posts currently loaded (post_likes carries no cluster column). */
export function useClusterPostLikes(clusterId: string | null, postIds: string[]) {
  return useQuery({
    queryKey: ['post-likes', clusterId ?? 'none'],
    enabled: clusterId !== null && postIds.length > 0,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('post_likes')
        .select('*')
        .in('post_id', postIds)
      if (error) throw error
      return (data ?? []) as PostLike[]
    },
  })
}

/** Likes on a single post, keyed by post. The Home preview mounts one card
 * per post (possibly sharing a cluster), where the cluster-keyed
 * useClusterPostLikes would collide; the feed/detail pages keep using that. */
export function usePostLikes(postId: string | null) {
  return useQuery({
    queryKey: ['post-likes', 'single', postId ?? 'none'],
    enabled: postId !== null,
    queryFn: async () => {
      if (!postId) throw new Error('No post')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('post_likes')
        .select('*')
        .eq('post_id', postId)
      if (error) throw error
      return (data ?? []) as PostLike[]
    },
  })
}

/** Likes on the comments currently loaded (comment_likes carries no cluster column). */
export function useClusterCommentLikes(clusterId: string | null, commentIds: string[]) {
  return useQuery({
    queryKey: ['comment-likes', clusterId ?? 'none'],
    enabled: clusterId !== null && commentIds.length > 0,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('comment_likes')
        .select('*')
        .in('comment_id', commentIds)
      if (error) throw error
      return (data ?? []) as CommentLike[]
    },
  })
}

/** Toggle the caller's like on a comment/reply optimistically (mirrors post likes). */
export function useToggleCommentLike(clusterId: string | null) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (commentId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('toggle_comment_like', { p_comment_id: commentId })
      if (error) throw error
    },
    onMutate: async (commentId) => {
      if (!clusterId || !userId) return
      await queryClient.cancelQueries({ queryKey: ['comment-likes', clusterId] })
      const prev = queryClient.getQueryData<CommentLike[]>(['comment-likes', clusterId])
      queryClient.setQueryData<CommentLike[]>(['comment-likes', clusterId], (cur) => {
        const base = cur ?? prev ?? []
        const liked = base.some((l) => l.comment_id === commentId && l.user_id === userId)
        if (liked) return base.filter((l) => !(l.comment_id === commentId && l.user_id === userId))
        return [...base, { comment_id: commentId, user_id: userId, liked_at: new Date().toISOString() }]
      })
      return { prev }
    },
    onError: (_e, _commentId, ctx) => {
      if (clusterId && ctx?.prev) {
        queryClient.setQueryData(['comment-likes', clusterId], ctx.prev)
      }
    },
    onSettled: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['comment-likes', clusterId] })
      }
    },
  })
}

/** All comments for a set of posts (feed list grouping). */
export function useClusterPostComments(clusterId: string | null, postIds: string[]) {  return useQuery({
    queryKey: ['post-comments', clusterId ?? 'none', 'all'],
    enabled: clusterId !== null && postIds.length > 0,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('post_comments')
        .select('*')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      if (error) throw error
      return ((data ?? []) as PostComment[]).sort(byOldest)
    },
  })
}

/** Comments for a single post (detail page). */
export function usePostComments(clusterId: string | null, postId: string | null) {
  return useQuery({
    queryKey: ['post-comments', clusterId ?? 'none', postId ?? 'none'],
    enabled: clusterId !== null && postId !== null,
    queryFn: async () => {
      if (!clusterId || !postId) throw new Error('No cluster or post')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('post_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      if (error) throw error
      return ((data ?? []) as PostComment[]).sort(byOldest)
    },
  })
}

export function useCreatePost(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      content,
      imageUrl,
      gifUrl,
      title,
    }: {
      content: string | null
      imageUrl?: string
      gifUrl?: string
      title?: string | null
    }) => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('create_post', {
        p_cluster_id: clusterId,
        p_content: content ?? undefined,
        p_image_url: imageUrl ?? undefined,
        p_gif_url: gifUrl ?? undefined,
        p_title: title ?? undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-posts', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['recent-posts'] })
      }
    },
  })
}

export function useEditPost(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      postId,
      content,
      title,
    }: {
      postId: string
      content: string
      title?: string | null
    }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('edit_post', {
        p_post_id: postId,
        p_content: content,
        p_title: title ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-posts', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['cluster-posts', 'single', variables.postId] })
        void queryClient.invalidateQueries({ queryKey: ['recent-posts'] })
      }
    },
  })
}

export function useDeletePost(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (postId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('delete_post', { p_post_id: postId })
      if (error) throw error
    },
    onSuccess: (_data, postId) => {
      if (clusterId) {
        // useClusterPosts merge-preserves earlier pages on refetch, so invalidating
        // alone would keep the deleted row from the existing cache. Drop it first.
        queryClient.setQueryData<Post[]>(['cluster-posts', clusterId], (cur) =>
          (cur ?? []).filter((p) => p.id !== postId),
        )
        queryClient.setQueryData<Post | null>(['cluster-posts', 'single', postId], () => null)
        void queryClient.invalidateQueries({ queryKey: ['cluster-posts', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['cluster-posts', 'single', postId] })
        void queryClient.invalidateQueries({ queryKey: ['recent-posts'] })
        void queryClient.invalidateQueries({ queryKey: ['post-likes', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['post-comments', clusterId, 'all'] })
      }
    },
  })
}

/** Toggle the caller's like on a post optimistically: the heart fills/counts
 * immediately, rolls back on error, then reconciles with the server. */
export function useTogglePostLike(clusterId: string | null) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (postId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('toggle_post_like', { p_post_id: postId })
      if (error) throw error
    },
    onMutate: async (postId) => {
      if (!clusterId || !userId) return
      await queryClient.cancelQueries({ queryKey: ['post-likes', clusterId] })
      const prev = queryClient.getQueryData<PostLike[]>(['post-likes', clusterId])
      const toggleLike = (base: PostLike[]) => {
        const liked = base.some((l) => l.post_id === postId && l.user_id === userId)
        if (liked) return base.filter((l) => !(l.post_id === postId && l.user_id === userId))
        return [...base, { post_id: postId, user_id: userId, liked_at: new Date().toISOString() }]
      }
      queryClient.setQueryData<PostLike[]>(['post-likes', clusterId], (cur) =>
        toggleLike(cur ?? prev ?? []),
      )
      queryClient.setQueryData<PostLike[]>(['post-likes', 'single', postId], (cur) =>
        toggleLike(cur ?? []),
      )
      return { prev }
    },
    onError: (_e, _postId, ctx) => {
      if (clusterId && ctx?.prev) {
        queryClient.setQueryData(['post-likes', clusterId], ctx.prev)
      }
    },
    onSettled: (_d, _e, postId) => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['post-likes', clusterId] })
      }
      void queryClient.invalidateQueries({ queryKey: ['post-likes', 'single', postId] })
    },
  })
}

export function useCreateComment(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      postId,
      content,
      imageUrl,
      gifUrl,
      parentCommentId,
    }: {
      postId: string
      content: string | null
      imageUrl?: string
      gifUrl?: string
      parentCommentId?: string
    }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('create_post_comment', {
        p_post_id: postId,
        p_content: content ?? undefined,
        p_image_url: imageUrl ?? undefined,
        p_gif_url: gifUrl ?? undefined,
        p_parent_comment_id: parentCommentId ?? undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['post-comments', clusterId] })
      }
    },
  })
}

export function useDeleteComment(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('delete_post_comment', { p_comment_id: commentId })
      if (error) throw error
    },
    onSuccess: (_data, commentId) => {
      if (clusterId) {
        // delete_post_comment removes the whole reply subtree; drop it from cache
        // too so the thread disappears immediately (and stays gone after refetch).
        queryClient.setQueriesData<PostComment[]>(
          { queryKey: ['post-comments', clusterId] },
          (cur) => {
            const base = cur ?? []
            const remove = new Set<string>([commentId])
            let added = true
            while (added) {
              added = false
              for (const c of base) {
                if (c.parent_comment_id && remove.has(c.parent_comment_id) && !remove.has(c.id)) {
                  remove.add(c.id)
                  added = true
                }
              }
            }
            return base.filter((c) => !remove.has(c.id))
          },
        )
        void queryClient.invalidateQueries({ queryKey: ['post-comments', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['comment-likes', clusterId] })
      }
    },
  })
}

export function useReportPost(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      postId,
      reason,
      details,
    }: {
      postId: string
      reason: Database['public']['Enums']['report_reason']
      details?: string
    }) => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('report_post', {
        p_cluster_id: clusterId,
        p_post_id: postId,
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

export function useReportComment(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      commentId,
      reason,
      details,
    }: {
      commentId: string
      reason: Database['public']['Enums']['report_reason']
      details?: string
    }) => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('report_post_comment', {
        p_cluster_id: clusterId,
        p_comment_id: commentId,
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

const POST_IMAGE_TTL_SECONDS = 3600
const POST_IMAGE_STALE_MS = POST_IMAGE_TTL_SECONDS * 1000 - 60_000

/** Recover the storage path of a post image from a stored value (URL or bare path). */
export function postImageStoragePath(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!stored.includes('/')) return stored
  const marker = '/posts-images/'
  const idx = stored.indexOf(marker)
  if (idx !== -1) {
    const raw = stored.slice(idx + marker.length).split('?')[0].split('#')[0]
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return stored
}

/** Delete a post-image object (member scoped by the 0075 storage policy). */
export async function deletePostImage(stored: string | null | undefined): Promise<void> {
  const path = postImageStoragePath(stored)
  if (!path) return
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from('posts-images').remove([path])
  if (error) throw error
}

/** A short-lived signed URL for a post image, refreshed before it expires. */
export function usePostImageUrl(path: string | null) {
  return useQuery({
    queryKey: ['post-image-url', path ?? 'none'],
    enabled: Boolean(path),
    queryFn: async () => {
      if (!path) throw new Error('No image path')
      const supabase = requireSupabase()
      const { data, error } = await supabase.storage
        .from('posts-images')
        .createSignedUrl(path, POST_IMAGE_TTL_SECONDS)
      if (error) throw error
      if (!data?.signedUrl) throw new Error('No signed URL')
      return data.signedUrl
    },
    staleTime: POST_IMAGE_STALE_MS,
    refetchInterval: POST_IMAGE_STALE_MS,
  })
}

/** Upload an image to the cluster's posts-images bucket; returns the storage path. */
export async function uploadPostImage(clusterId: string, file: File): Promise<string> {
  const supabase = requireSupabase()
  const prepared = await prepareImage(file, { maxDimension: 1600 })
  const ext = (prepared.name.split('.').pop() || 'webp').toLowerCase()
  const path = `${clusterId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('posts-images').upload(path, prepared, {
    contentType: prepared.type,
  })
  if (error) throw error
  return path
}
