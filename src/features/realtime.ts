import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type Message = Database['public']['Tables']['messages']['Row']
type Reaction = Database['public']['Tables']['message_reactions']['Row']
type Signal = Database['public']['Tables']['signals']['Row']
type SignalReply = Database['public']['Tables']['signal_replies']['Row']
type Vote = Database['public']['Tables']['votes']['Row']

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
 * Subscribes to Postgres Changes for one cluster and patches the TanStack caches in
 * place (docs 04 §1 / §3). Safe to mount once per cluster shell - RLS keeps locked
 * clusters from delivering anything. Message-reaction and signal-reply events carry no
 * cluster id, so they are routed via a lookup to whatever cluster cache they belong to.
 */
export function useClusterChannel(clusterId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!clusterId) return
    const supabase = requireSupabase()

    const messagesKey = ['cluster-messages', clusterId]
    const signalsKey = ['cluster-signals', clusterId]
    const votesKey = ['cluster-votes', clusterId]

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
  const channelRef = useRef<RealtimeChannel | null>(null)

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
      channelRef.current = channel

      channel
        .on('presence', { event: 'sync' }, refresh)
        .on('presence', { event: 'join' }, refresh)
        .on('presence', { event: 'leave' }, refresh)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ user_id: entry!.userId, typing: false })
        })
    } else {
      channelRef.current = entry.channel
    }

    const listener = (state: ClusterPresence) => setPresence(state)
    entry.listeners.add(listener)
    entry.refresh()

    return () => {
      entry!.listeners.delete(listener)
      if (entry!.listeners.size === 0) {
        supabase.removeChannel(entry!.channel)
        presenceStore.delete(clusterId)
        channelRef.current = null
      }
    }
  }, [clusterId, userId])

  const signalTyping = useCallback(() => {
    const channel = channelRef.current
    if (!channel || !userId) return
    void channel.track({ user_id: userId, typing: true })
  }, [userId])

  const resetTyping = useCallback(() => {
    const channel = channelRef.current
    if (!channel || !userId) return
    void channel.track({ user_id: userId, typing: false })
  }, [userId])

  return { online: presence.online, typing: presence.typing, signalTyping, resetTyping }
}
