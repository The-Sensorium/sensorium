import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import type { Post, PostComment, PostLike, CommentLike } from './posts'

type Message = Database['public']['Tables']['messages']['Row']
type Reaction = Database['public']['Tables']['message_reactions']['Row']
type Signal = Database['public']['Tables']['signals']['Row']
type SignalReply = Database['public']['Tables']['signal_replies']['Row']
type Vote = Database['public']['Tables']['votes']['Row']
type PostRealtime = Post
type PostCommentRealtime = PostComment
type PostLikeRealtime = PostLike
type CommentLikeRealtime = CommentLike

// Same ordering as the fetch (created_at, id): same-transaction inserts can
// share a timestamp, and the patched row must sort exactly where a refetch
// would put it.
const byCreatedAsc = (a: Message, b: Message) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/**
 * Route a message INSERT into the room cache. When there is no cache yet the
 * initial fetch is still in flight or failed (deep link racing the fetch):
 * dropping the event would lose the message, so refetch instead.
 */
export function patchMessageInsert(
  queryClient: ReturnType<typeof useQueryClient>,
  clusterId: string,
  row: Message,
) {
  const key = ['cluster-messages', clusterId]
  if (!queryClient.getQueryData<Message[]>(key)) {
    void queryClient.invalidateQueries({ queryKey: key })
    return
  }
  queryClient.setQueryData<Message[]>(key, (cur) => {
    if (!cur || cur.some((m) => m.id === row.id)) return cur
    return [...cur, row].sort(byCreatedAsc)
  })
}

/** Route a reaction event to its cluster cache (reactions carry cluster_id). */
function patchReaction(
  queryClient: ReturnType<typeof useQueryClient>,
  reaction: Reaction,
  kind: 'insert' | 'delete',
) {
  const clusterId = reaction.cluster_id
  if (!clusterId) return
  queryClient.setQueryData<Reaction[]>(['cluster-reactions', clusterId], (cur) => {
    if (!cur) return cur
    if (kind === 'insert') {
      const dup = cur.some(
        (r) =>
          r.message_id === reaction.message_id &&
          r.user_id === reaction.user_id &&
          r.emoji === reaction.emoji,
      )
      return dup ? cur : [...cur, reaction]
    }
    return cur.filter(
      (r) =>
        !(
          r.message_id === reaction.message_id &&
          r.user_id === reaction.user_id &&
          r.emoji === reaction.emoji
        ),
    )
  })
}

/**
 * Route a signal-reply INSERT to its cluster caches (replies carry cluster_id).
 * Patches only caches that already exist.
 */
function patchSignalReply(queryClient: ReturnType<typeof useQueryClient>, reply: SignalReply) {
  const clusterId = reply.cluster_id
  if (!clusterId) return
  const keys: Array<[string, string, string]> = [
    ['signal-replies', clusterId, reply.signal_id],
    ['signal-replies', clusterId, 'all'],
  ]
  for (const key of keys) {
    queryClient.setQueryData<SignalReply[]>(key, (cur) => {
      if (!cur || cur.some((r) => r.id === reply.id)) return cur
      return [...cur, reply].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  }
  void queryClient.invalidateQueries({ queryKey: ['signal-reply-counts', clusterId] })
}

/**
 * Patch post-scoped 'many' caches (profile pages) whose key lists the given
 * post id. Patch-only-existing, like the single-cluster handlers below.
 */
function patchManyByPost<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  prefix: string,
  postId: string,
  apply: (cur?: T[]) => T[] | undefined,
) {
  for (const [key] of queryClient.getQueriesData<T[]>({ queryKey: [prefix, 'many'] })) {
    if (String(key[2] ?? '').split(',').includes(postId)) {
      queryClient.setQueryData<T[]>(key, apply)
    }
  }
}

/**
 * Revalidate post-scoped 'many' count caches covering the given cluster.
 * Counts keys list cluster ids, so they match on cluster, not post.
 */
function invalidateManyByCluster(
  queryClient: ReturnType<typeof useQueryClient>,
  prefix: string,
  clusterId: string,
) {
  for (const [key] of queryClient.getQueriesData({ queryKey: [prefix, 'many'] })) {
    if (String(key[2] ?? '').split(',').includes(clusterId)) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }
}

/**
 * Route a post-like INSERT/DELETE to its cluster caches (likes carry
 * cluster_id). Patches only caches that already exist. The Home
 * preview reads per-post ['post-likes', 'single', postId] caches, so patch those
 * too (mirrors how patchPostComment patches both comment cache keys).
 */
function patchPostLike(
  queryClient: ReturnType<typeof useQueryClient>,
  like: PostLikeRealtime,
  kind: 'insert' | 'delete',
) {
  const clusterId = like.cluster_id
  if (!clusterId) return
  const apply = (cur?: PostLikeRealtime[]) => {
    if (!cur) return cur
    if (kind === 'insert') {
      const dup = cur.some((r) => r.post_id === like.post_id && r.user_id === like.user_id)
      return dup ? cur : [...cur, like]
    }
    return cur.filter((r) => !(r.post_id === like.post_id && r.user_id === like.user_id))
  }
  queryClient.setQueriesData<PostLikeRealtime[]>({ queryKey: ['post-likes', clusterId] }, apply)
  queryClient.setQueryData<PostLikeRealtime[]>(['post-likes', 'single', like.post_id], apply)
  patchManyByPost<PostLikeRealtime>(queryClient, 'post-likes', like.post_id, apply)
  void queryClient.invalidateQueries({ queryKey: ['post-counts', clusterId] })
  invalidateManyByCluster(queryClient, 'post-counts', clusterId)
}

/** Route a post-comment INSERT to its cluster caches (comments carry cluster_id). */
function patchPostComment(
  queryClient: ReturnType<typeof useQueryClient>,
  comment: PostCommentRealtime,
) {
  const clusterId = comment.cluster_id
  if (!clusterId) return
  // Feed reads ['post-comments', clusterId, 'all']; the detail page reads
  // ['post-comments', 'single', postId], so patch both to keep them in sync.
  const insert = (cur?: PostCommentRealtime[]) => {
    if (!cur || cur.some((c) => c.id === comment.id)) return cur
    return [...cur, comment].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  queryClient.setQueryData<PostCommentRealtime[]>(['post-comments', clusterId, 'all'], insert)
  queryClient.setQueryData<PostCommentRealtime[]>(['post-comments', clusterId, comment.post_id], insert)
  queryClient.setQueryData<PostCommentRealtime[]>(['post-comments', 'single', comment.post_id], insert)
  patchManyByPost<PostCommentRealtime>(queryClient, 'post-comments', comment.post_id, insert)
  void queryClient.invalidateQueries({ queryKey: ['post-counts', clusterId] })
  invalidateManyByCluster(queryClient, 'post-counts', clusterId)
}

/** Route a comment-like INSERT/DELETE to its cluster cache (likes carry cluster_id). */
function patchCommentLike(
  queryClient: ReturnType<typeof useQueryClient>,
  like: CommentLikeRealtime,
  kind: 'insert' | 'delete',
) {
  const clusterId = like.cluster_id
  if (!clusterId) return
  queryClient.setQueryData<CommentLikeRealtime[]>(['comment-likes', clusterId], (cur) => {
    if (!cur) return cur
    if (kind === 'insert') {
      const dup = cur.some((l) => l.comment_id === like.comment_id && l.user_id === like.user_id)
      return dup ? cur : [...cur, like]
    }
    return cur.filter((l) => !(l.comment_id === like.comment_id && l.user_id === like.user_id))
  })
}

/**
 * Route a call-participant INSERT/UPDATE/DELETE to its cluster caches
 * (participants carry cluster_id). Patches only caches that already exist.
 */
function patchCallParticipants(
  queryClient: ReturnType<typeof useQueryClient>,
  participant: { call_id: string; cluster_id: string | null },
) {
  const clusterId = participant.cluster_id
  if (!clusterId) return
  void queryClient.invalidateQueries({ queryKey: ['active-call', clusterId] })
  void queryClient.invalidateQueries({ queryKey: ['call-participants', participant.call_id] })
}

/**
 * Subscribes to Postgres Changes for one cluster and patches the TanStack caches in
 * place (docs 04 §1 / §3). Safe to mount once per cluster shell - RLS keeps locked
 * clusters from delivering anything. Child rows (reactions, replies, likes,
 * comments, participants) carry cluster_id, so every handler filters on it.
 */
export function useClusterChannel(clusterId: string | null) {  const queryClient = useQueryClient()

  useEffect(() => {
    if (!clusterId) return
    const supabase = requireSupabase()

    const messagesKey = ['cluster-messages', clusterId]
    const signalsKey = ['cluster-signals', clusterId]
    const votesKey = ['cluster-votes', clusterId]
    const postsKey = ['cluster-posts', clusterId]

    const channel = supabase
      .channel(`cluster:${clusterId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchMessageInsert(queryClient, clusterId, payload.new as Message)
          // Plain chat writes no notification row and is excluded from the
          // badge; per-cluster unread lives in get_unread_chat_counts, so a
          // new message must also bump the notification queries. Scoped here
          // on purpose: only viewers of this cluster (RLS + cluster_id
          // filter) refetch, instead of every client DB-wide.
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          const row = payload.new as Message
          queryClient.setQueryData<Message[]>(messagesKey, (cur) =>
            cur ? cur.map((m) => (m.id === row.id ? row : m)) : cur,
          )
        },
      )
      .on('broadcast', { event: 'message_deleted' }, ({ payload }) => {
        // Soft-deletes never arrive as postgres_changes: the deleted row fails
        // the SELECT policy, so the server filters the event out. The deleter
        // broadcasts explicitly instead (see useDeleteMessage).
        const id = (payload as { message_id?: unknown } | null)?.message_id
        if (typeof id === 'string') {
          queryClient.setQueryData<Message[]>(messagesKey, (cur) =>
            (cur ?? []).filter((m) => m.id !== id),
          )
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchReaction(queryClient, payload.new as Reaction, 'insert')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchReaction(queryClient, payload.old as Reaction, 'delete')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signals',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          const row = payload.new as Signal
          queryClient.setQueryData<Signal[]>(signalsKey, (cur) => {
            if (!cur || cur.some((s) => s.id === row.id)) return cur
            return [row, ...cur]
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'signals',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          const row = payload.new as Signal
          queryClient.setQueryData<Signal[]>(signalsKey, (cur) =>
            cur ? cur.map((s) => (s.id === row.id ? row : s)) : cur,
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signal_replies',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchSignalReply(queryClient, payload.new as SignalReply)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'votes',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          const row = payload.new as Vote
          queryClient.setQueryData<Vote[]>(votesKey, (cur) => {
            if (!cur || cur.some((v) => v.id === row.id)) return cur
            return [row, ...cur]
          })
          void queryClient.invalidateQueries({ queryKey: ['vote-counts', clusterId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'votes',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          const row = payload.new as Vote
          queryClient.setQueryData<Vote[]>(votesKey, (cur) =>
            cur ? cur.map((v) => (v.id === row.id ? row : v)) : cur,
          )
          void queryClient.invalidateQueries({ queryKey: ['vote-counts', clusterId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'replacement_rounds',
          filter: `cluster_id=eq.${clusterId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['replacement-round', clusterId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cluster_members',
          filter: `cluster_id=eq.${clusterId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['cluster-members', clusterId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cluster_members',
          filter: `cluster_id=eq.${clusterId}`,
        },
        () => {
          // A leave sets left_at (UPDATE); refresh the count so the room reflects it live.
          void queryClient.invalidateQueries({ queryKey: ['cluster-members', clusterId] })
          // A read advances last_read_message_at; refresh any open receipt dialog
          // (its per-message read rows are the source, so invalidate those too).
          void queryClient.invalidateQueries({ queryKey: ['message-reads', clusterId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'replacement_rounds',
          filter: `cluster_id=eq.${clusterId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['replacement-round', clusterId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          const row = payload.new as PostRealtime
          queryClient.setQueryData<Post[]>(postsKey, (cur) => {
            if (!cur || cur.some((p) => p.id === row.id)) return cur
            return [row, ...cur]
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'posts',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          const row = payload.new as PostRealtime
          queryClient.setQueryData<Post[]>(postsKey, (cur) =>
            cur ? cur.map((p) => (p.id === row.id ? row : p)) : cur,
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_likes',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchPostLike(queryClient, payload.new as PostLikeRealtime, 'insert')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'post_likes',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchPostLike(queryClient, payload.old as PostLikeRealtime, 'delete')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'posts',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          const row = payload.old as PostRealtime
          queryClient.setQueryData<Post[]>(postsKey, (cur) =>
            cur ? cur.filter((p) => p.id !== row.id) : cur,
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_comments',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchPostComment(queryClient, payload.new as PostCommentRealtime)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comment_likes',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchCommentLike(queryClient, payload.new as CommentLikeRealtime, 'insert')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comment_likes',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchCommentLike(queryClient, payload.old as CommentLikeRealtime, 'delete')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'calls',
          filter: `cluster_id=eq.${clusterId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['active-call', clusterId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `cluster_id=eq.${clusterId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['active-call', clusterId] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_participants',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchCallParticipants(queryClient, payload.new as { call_id: string; cluster_id: string })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_participants',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchCallParticipants(queryClient, payload.new as { call_id: string; cluster_id: string })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'call_participants',
          filter: `cluster_id=eq.${clusterId}`,
        },
        (payload) => {
          patchCallParticipants(queryClient, payload.old as { call_id: string; cluster_id: string })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clusterId, queryClient])
}

export interface ClusterPresence {
  online: Set<string>
  typing: Set<string>
}

// Self is intentionally always shown online. The presence set only holds other
// members, so callers must pass their own id through here instead of inlining
// the comparison.
export function isOnlineNow(online: Set<string>, memberId: string, selfId: string | null) {
  return online.has(memberId) || memberId === selfId
}

interface PresenceEntry {
  channel: RealtimeChannel
  userId: string
  online: Set<string>
  typing: Set<string>
  broadcastTyping: boolean
  refresh: () => void
  listeners: Set<(state: ClusterPresence) => void>
  teardownBackground?: () => void
}

/**
 * One presence channel per cluster per user is shared by every caller (the room
 * composer, the "who's here" band, the desktop rail, the members list). Without
 * this, two components subscribing to the same `presence:<clusterId>` channel
 * make Supabase throw "cannot add presence callbacks after subscribe()".
 */
const presenceStore = new Map<string, PresenceEntry>()

/**
 * Presence channel for a cluster: who is online, who is typing. Also exposes
 * `signalTyping` / `resetTyping` for the composer to broadcast its own typing state.
 * Presence metadata is `{ user_id, typing }`.
 */
export function usePresence(clusterId: string | null) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const [presence, setPresence] = useState<ClusterPresence>({ online: new Set(), typing: new Set() })
  // The shared presence channel for this cluster lives in the module-level
  // `presenceStore`. Its `broadcastTyping` flag holds the last typing state this
  // client broadcast so a (re)subscribe re-broadcasts it, not the initial
  // `false` - otherwise typing is lost across a StrictMode remount or socket
  // reconnect. The flag lives on the entry (not a per-hook ref) because any
  // instance may create the shared channel, and its subscribe callback must read
  // the state that *this* client is broadcasting regardless of who created it.
  const entryRef = useRef<PresenceEntry | null>(null)

  useEffect(() => {
    if (!clusterId || !userId) return
    const supabase = requireSupabase()
    const storeKey = `${clusterId}:${userId}`

    let entry = presenceStore.get(storeKey)
    if (!entry) {
      const channel = supabase.channel(`presence:${clusterId}`, {
        config: { presence: { key: userId } },
      })
      entry = {
        channel,
        userId,
        online: new Set(),
        typing: new Set(),
        broadcastTyping: false,
        refresh: () => {},
        listeners: new Set(),
      }
      const refresh = () => {
        const online = new Set<string>()
        const typing = new Set<string>()
        for (const infos of Object.values(channel.presenceState())) {
          for (const info of infos as { user_id?: string; typing?: boolean }[]) {
            if (!info.user_id || info.user_id === entry!.userId) continue
            online.add(info.user_id)
            if (info.typing) typing.add(info.user_id)
          }
        }
        entry!.online = online
        entry!.typing = typing
        const snap: ClusterPresence = { online, typing }
        for (const listener of entry!.listeners) listener(snap)
      }
      entry.refresh = refresh
      presenceStore.set(storeKey, entry)

      channel
        .on('presence', { event: 'sync' }, refresh)
        .on('presence', { event: 'join' }, refresh)
        .on('presence', { event: 'leave' }, refresh)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ user_id: entry!.userId, typing: entry!.broadcastTyping })
          }
        })

      const goOffline = () => {
        entry!.broadcastTyping = false
        void entry!.channel.untrack()
      }
      const goOnline = () => {
        if (document.hidden) return
        void entry!.channel.track({ user_id: entry!.userId, typing: entry!.broadcastTyping })
      }
      const onVisibility = () => {
        if (document.hidden) goOffline()
        else goOnline()
      }
      const onPageHide = () => {
        goOffline()
      }
      const onPageShow = () => {
        goOnline()
      }
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('offline', goOffline)
      window.addEventListener('online', goOnline)
      window.addEventListener('pagehide', onPageHide)
      window.addEventListener('pageshow', onPageShow)
      entry.teardownBackground = () => {
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('offline', goOffline)
        window.removeEventListener('online', goOnline)
        window.removeEventListener('pagehide', onPageHide)
        window.removeEventListener('pageshow', onPageShow)
      }
    }

    entryRef.current = entry

    const listener = (state: ClusterPresence) => setPresence(state)
    entry.listeners.add(listener)
    entry.refresh()

    return () => {
      entry!.listeners.delete(listener)
      if (entry!.listeners.size === 0) {
        // Defer tearing down the shared channel by a tick: React StrictMode (dev)
        // synchronously re-runs the effect after cleanup, and that re-run re-adds
        // a listener before the timer fires. Without this the channel briefly goes
        // through join/leave/join, which can make the server drop later presence
        // tracks. A real unmount is unaffected (the timer fires a hair later).
        window.setTimeout(() => {
          const current = presenceStore.get(storeKey)
          if (current === entry && current.listeners.size === 0) {
            current.teardownBackground?.()
            supabase.removeChannel(current.channel)
            presenceStore.delete(storeKey)
          }
        }, 0)
      }
    }
  }, [clusterId, userId])

  const signalTyping = useCallback(() => {
    const entry = entryRef.current
    if (!entry || entry.broadcastTyping) return
    entry.broadcastTyping = true
    void entry.channel.track({ user_id: entry.userId, typing: true })
  }, [])

  const resetTyping = useCallback(() => {
    const entry = entryRef.current
    if (!entry || !entry.broadcastTyping) return
    entry.broadcastTyping = false
    void entry.channel.track({ user_id: entry.userId, typing: false })
  }, [])

  return { online: presence.online, typing: presence.typing, signalTyping, resetTyping }
}
