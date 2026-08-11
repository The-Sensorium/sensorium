import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase, type MatchingMode } from '../lib/supabase'
import { prepareImage } from '../lib/image'

type Message = Database['public']['Tables']['messages']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Reaction = Database['public']['Tables']['message_reactions']['Row']

export const CHAT_PAGE_SIZE = 100

// Deterministic tie-break for messages sharing a created_at (same-transaction
// inserts): the fetch orders by id, so the cache sort must match.
const byCreatedIdAsc = (a: Message, b: Message) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/**
 * The room's newest messages, oldest first. A cluster outlives its members and
 * can accumulate thousands of rows, so the room loads only the latest page and
 * fetches earlier pages on demand (useLoadEarlierMessages).
 *
 * A refetch only returns the newest page. The query keeps any earlier pages the
 * user already loaded, so invalidations from send/edit/delete don't truncate
 * the timeline, while rows inside the fresh window stay authoritative.
 */
export function useClusterMessages(clusterId: string | null, enabled = true) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['cluster-messages', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const key: ['cluster-messages', string] = ['cluster-messages', clusterId]
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(CHAT_PAGE_SIZE)
      if (error) throw error
      const fresh = ((data ?? []) as Message[]).sort(byCreatedIdAsc)
      if (fresh.length === 0) return queryClient.getQueryData<Message[]>(key) ?? []
      const oldestFresh = fresh[0]!
      const newestFresh = fresh[fresh.length - 1]!
      // Keep cached rows outside the fresh window: strictly older rows are
      // earlier pages, strictly newer rows may have arrived via the live
      // channel while this refetch was in flight.
      const fromExisting = (queryClient.getQueryData<Message[]>(key) ?? []).filter((m) => {
        if (m.created_at < oldestFresh.created_at) return true
        if (m.created_at > newestFresh.created_at) return true
        if (m.created_at === oldestFresh.created_at) return m.id < oldestFresh.id
        if (m.created_at === newestFresh.created_at) return m.id > newestFresh.id
        return false
      })
      const byId = new Map<string, Message>()
      for (const m of [...fromExisting, ...fresh]) byId.set(m.id, m)
      return [...byId.values()].sort(byCreatedIdAsc)
    },
  })
}

/**
 * Load one earlier page of messages and prepend it to the cache. The cursor is
 * inclusive on created_at with a client-side dedupe, so messages sharing the
 * oldest timestamp aren't skipped at a page boundary. The live channel keeps
 * appending new messages, so the cache can grow past the initial page cap while
 * the room is open. Returns how many rows were added and whether a full page
 * came back (i.e. more may exist before the cursor).
 */
export function useLoadEarlierMessages(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<{ added: number; hasMore: boolean }> => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const key: ['cluster-messages', string] = ['cluster-messages', clusterId]
      const current = queryClient.getQueryData<Message[]>(key) ?? []
      const oldest = current[0]
      let query = supabase
        .from('messages')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(CHAT_PAGE_SIZE)
      if (oldest) query = query.lte('created_at', oldest.created_at)
      const { data, error } = await query
      if (error) throw error
      const older = ((data ?? []) as Message[]).sort(byCreatedIdAsc)
      // Functional update so a message appended by the live channel while this
      // query is in flight isn't clobbered by a stale snapshot.
      queryClient.setQueryData<Message[]>(key, (existing) => {
        const byId = new Map<string, Message>()
        for (const m of [...older, ...(existing ?? current)]) byId.set(m.id, m)
        return [...byId.values()].sort(byCreatedIdAsc)
      })
      const added = older.filter((m) => !current.some((c) => c.id === m.id)).length
      return { added, hasMore: added === CHAT_PAGE_SIZE }
    },
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clusterId,
      content,
      imageUrl,
      replyToId,
    }: {
      clusterId: string
      content: string | null
      imageUrl?: string
      replyToId?: string
    }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('send_message', {
        p_cluster_id: clusterId,
        p_content: content ?? undefined,
        p_image_url: imageUrl ?? undefined,
        p_reply_to_id: replyToId ?? undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['cluster-messages', variables.clusterId] })
    },
  })
}

/**
 * Reactions on the messages currently loaded in the room. message_reactions has
 * no cluster column, so the query is bounded to the loaded ids instead of every
 * message ever sent in the cluster.
 */
export function useClusterReactions(clusterId: string | null, messageIds?: string[]) {
  return useQuery({
    queryKey: ['cluster-reactions', clusterId ?? 'none'],
    enabled: clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const ids = (messageIds ?? []).filter((id): id is string => Boolean(id))
      if (ids.length === 0) return [] as Reaction[]
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', ids)
      if (error) throw error
      return (data ?? []) as Reaction[]
    },
  })
}

/**
 * Messages referenced by reply_to_id that aren't already in the room's loaded
 * window (a reply can point at an older message that scrolled out of the first
 * page). Bounded to the missing ids; returns a map so callers can merge it with
 * the loaded messages and render a reply preview.
 */
export function useReplyTargets(clusterId: string | null, parentIds: string[]) {
  return useQuery({
    queryKey: ['cluster-reply-targets', clusterId ?? 'none', [...parentIds].sort()],
    enabled: clusterId !== null && parentIds.length > 0,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('id', parentIds)
      if (error) throw error
      const map = new Map<string, Message>()
      for (const m of data ?? []) map.set(m.id, m as Message)
      return map
    },
  })
}

/** Toggle the caller's reaction on a message (RLS: insert/delete own rows). */
export function useToggleReaction(clusterId: string | null) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data: existing } = await supabase
        .from('message_reactions')
        .select('message_id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle()
      if (existing) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId)
          .eq('emoji', emoji)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, user_id: userId, emoji })
        if (error) throw error
      }
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-reactions', clusterId] })
      }
    },
  })
}

/** Edit own message: author-only RLS update of content + edited_at. */
export function useEditMessage(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const supabase = requireSupabase()
      const { error } = await supabase
        .from('messages')
        .update({ content, edited_at: new Date().toISOString() })
        .eq('id', messageId)
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-messages', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['cluster-reply-targets', clusterId] })
      }
    },
  })
}

/** Soft-delete own message: author-only RLS update of deleted_at. */
export function useDeleteMessage(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase
        .from('messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', messageId)
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['cluster-messages', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['cluster-reply-targets', clusterId] })
      }
    },
  })
}

const CHAT_IMAGE_TTL_SECONDS = 3600
const CHAT_IMAGE_STALE_MS = CHAT_IMAGE_TTL_SECONDS * 1000 - 60_000 // refresh a minute before expiry

/** A short-lived signed URL for a chat-image, refreshed before it expires. */
export function useChatImageUrl(path: string) {
  return useQuery({
    queryKey: ['chat-image-url', path],
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.storage
        .from('chat-images')
        .createSignedUrl(path, CHAT_IMAGE_TTL_SECONDS)
      if (error) throw error
      if (!data?.signedUrl) throw new Error('No signed URL')
      return data.signedUrl
    },
    staleTime: CHAT_IMAGE_STALE_MS,
    refetchInterval: CHAT_IMAGE_STALE_MS,
  })
}

/** Upload an image to the cluster's chat-images bucket; returns the storage path. */
export async function uploadChatImage(clusterId: string, file: File): Promise<string> {
  const supabase = requireSupabase()
  const prepared = await prepareImage(file, { maxDimension: 1600 })
  const ext = (prepared.name.split('.').pop() || 'webp').toLowerCase()
  const path = `${clusterId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('chat-images').upload(path, prepared, {
    contentType: prepared.type,
  })
  if (error) throw error
  return path
}

export function useLeaveCluster() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (clusterId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('leave_cluster', { p_cluster_id: clusterId })
      if (error) throw error
    },
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['my-clusters', userId] })
      }
    },
  })
}

/** Member's intro answers (RLS: readable by active members once the cluster is unlocked). */
export function useMemberIntroAnswers(
  clusterId: string | null,
  memberId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['member-intro-answers', clusterId ?? 'none', memberId ?? 'none'],
    enabled: enabled && clusterId !== null && memberId !== null,
    queryFn: async () => {
      if (!clusterId || !memberId) throw new Error('No cluster or member')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('intro_answers')
        .select('question_id, answer, created_at')
        .eq('cluster_id', clusterId)
        .eq('user_id', memberId)
        .order('question_id', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useIntroQuestionMap() {
  return useQuery({
    queryKey: ['intro-questions'],
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_intro_questions')
      if (error) throw error
      const map = new Map<number, string>()
      for (const q of data ?? []) map.set(q.id, q.prompt)
      return map
    },
  })
}

export interface ProfilePatch {
  display_name?: string
  bio?: string | null
  avatar_url?: string | null
  current_status?: string | null
  pronouns?: string | null
  availability?: Database['public']['Enums']['availability']
}

/** Update the signed-in user's own profile (RLS: self update). */
export function useUpdateProfile() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
        void queryClient.invalidateQueries({ queryKey: ['cluster-members'] })
      }
    },
  })
}

export type { Message, Profile, Reaction }
export type { MatchingMode }
