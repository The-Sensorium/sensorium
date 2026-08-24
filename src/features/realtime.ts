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

const byCreatedAsc = (a: Message, b: Message) => a.created_at.localeCompare(b.created_at)

/** Route a reaction event to the query cache of the cluster its message belongs to. */
async function patchReaction(
  queryClient: ReturnType<typeof useQueryClient>,
  reaction: Reaction,
  kind: 'insert' | 'delete',
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('messages')
    .select('cluster_id')
    .eq('id', reaction.message_id)
    .maybeSingle()
  if (error || !data) return
  queryClient.setQueryData<Reaction[]>(['cluster-reactions', data.cluster_id], (cur) => {
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
 * Route a signal-reply INSERT to the caches of the cluster its signal belongs to
 * (replies carry no cluster id). Patches only caches that already exist.
 */
async function patchSignalReply(queryClient: ReturnType<typeof useQueryClient>, reply: SignalReply) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('signals')
    .select('cluster_id')
    .eq('id', reply.signal_id)
    .maybeSingle()
  if (error || !data) return
  const clusterId = data.cluster_id
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
}

/**
 * Route a post-like INSERT/DELETE to the cache of the cluster its post belongs to
 * (likes carry no cluster id). Patches only caches that already exist.
 */
async function patchPostLike(
  queryClient: ReturnType<typeof useQueryClient>,
  like: PostLikeRealtime,
  kind: 'insert' | 'delete',
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('posts')
    .select('cluster_id')
    .eq('id', like.post_id)
    .maybeSingle()
  if (error || !data) return
  const clusterId = data.cluster_id
  queryClient.setQueryData<PostLikeRealtime[]>(['post-likes', clusterId], (cur) => {
    if (!cur) return cur
    if (kind === 'insert') {
      const dup = cur.some((r) => r.post_id === like.post_id && r.user_id === like.user_id)
      return dup ? cur : [...cur, like]
    }
    return cur.filter((r) => !(r.post_id === like.post_id && r.user_id === like.user_id))
  })
}

/** Route a post-comment INSERT to the cache of the cluster its post belongs to. */
async function patchPostComment(
  queryClient: ReturnType<typeof useQueryClient>,
  comment: PostCommentRealtime,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('posts')
    .select('cluster_id')
    .eq('id', comment.post_id)
    .maybeSingle()
  if (error || !data) return
  const clusterId = data.cluster_id
  queryClient.setQueryData<PostCommentRealtime[]>(['post-comments', clusterId, 'all'], (cur) => {
    if (!cur || cur.some((c) => c.id === comment.id)) return cur
    return [...cur, comment].sort((a, b) => a.created_at.localeCompare(b.created_at))
  })
}

/** Route a comment-like INSERT/DELETE to the cache of the cluster its comment belongs to. */
async function patchCommentLike(
  queryClient: ReturnType<typeof useQueryClient>,
  like: CommentLikeRealtime,
  kind: 'insert' | 'delete',
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('post_comments')
    .select('post_id, posts(cluster_id)')
    .eq('id', like.comment_id)
    .maybeSingle()
  if (error || !data) return
  const clusterId = (data.posts as { cluster_id: string } | null)?.cluster_id
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
 * Subscribes to Postgres Changes for one cluster and patches the TanStack caches in
 * place (docs 04 §1 / §3). Safe to mount once per cluster shell - RLS keeps locked
 * clusters from delivering anything. Message-reaction and signal-reply events carry no
 * cluster id, so they are routed via a lookup to whatever cluster cache they belong to.
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
          const row = payload.new as Message
          queryClient.setQueryData<Message[]>(messagesKey, (cur) => {
            if (!cur || cur.some((m) => m.id === row.id)) return cur
            return [...cur, row].sort(byCreatedAsc)
          })
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
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          void patchReaction(queryClient, payload.new as Reaction, 'insert')
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          void patchReaction(queryClient, payload.old as Reaction, 'delete')
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
        { event: 'INSERT', schema: 'public', table: 'signal_replies' },
        (payload) => {
          void patchSignalReply(queryClient, payload.new as SignalReply)
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
          void queryClient.invalidateQueries({ queryKey: ['replacement-candidates'] })
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
          void queryClient.invalidateQueries({ queryKey: ['replacement-candidates'] })
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_likes' }, (payload) => {
        void patchPostLike(queryClient, payload.new as PostLikeRealtime, 'insert')
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'post_likes' }, (payload) => {
        void patchPostLike(queryClient, payload.old as PostLikeRealtime, 'delete')
      })
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
        { event: 'INSERT', schema: 'public', table: 'post_comments' },
        (payload) => {
          void patchPostComment(queryClient, payload.new as PostCommentRealtime)
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comment_likes' },
        (payload) => {
          void patchCommentLike(queryClient, payload.new as CommentLikeRealtime, 'insert')
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comment_likes' },
        (payload) => {
          void patchCommentLike(queryClient, payload.old as CommentLikeRealtime, 'delete')
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

interface PresenceEntry {
  channel: RealtimeChannel
  userId: string
  online: Set<string>
  typing: Set<string>
  broadcastTyping: boolean
  refresh: () => void
  listeners: Set<(state: ClusterPresence) => void>
}

/**
 * One presence channel per cluster is shared by every caller (the room composer,
 * the "who's here" band, the desktop rail, the members list). Without this, two
 * components subscribing to the same `presence:<clusterId>` channel make Supabase
 * throw "cannot add presence callbacks after subscribe()".
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

    let entry = presenceStore.get(clusterId)
    if (!entry) {
      const channel = supabase.channel(`presence:${clusterId}`)
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
      presenceStore.set(clusterId, entry)

      channel
        .on('presence', { event: 'sync' }, refresh)
        .on('presence', { event: 'join' }, refresh)
        .on('presence', { event: 'leave' }, refresh)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ user_id: entry!.userId, typing: entry!.broadcastTyping })
          }
        })
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
          const current = presenceStore.get(clusterId)
          if (current === entry && current.listeners.size === 0) {
            supabase.removeChannel(current.channel)
            presenceStore.delete(clusterId)
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
