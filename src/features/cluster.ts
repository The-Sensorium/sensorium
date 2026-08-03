import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase, type MatchingMode } from '../lib/supabase'
import type { Mood } from '../lib/moods'
import { prepareImage } from '../lib/image'

type Message = Database['public']['Tables']['messages']['Row']
type MoodRow = Database['public']['Tables']['moods']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Reaction = Database['public']['Tables']['message_reactions']['Row']

export function useClusterMessages(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['cluster-messages', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Message[]
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
    }: {
      clusterId: string
      content: string | null
      imageUrl?: string
    }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('send_message', {
        p_cluster_id: clusterId,
        p_content: content ?? undefined,
        p_image_url: imageUrl ?? undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['cluster-messages', variables.clusterId] })
    },
  })
}

/** All mood rows in a cluster (RLS: active members). Latest-per-user derived in views. */
export function useClusterMoods(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['cluster-moods', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('moods')
        .select('user_id, cluster_id, mood, created_at')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as MoodRow[]
    },
  })
}

export function useSetMood() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clusterId,
      mood,
    }: {
      clusterId: string
      mood: Mood
    }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('set_mood', {
        p_cluster_id: clusterId,
        p_mood: mood,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['cluster-moods', variables.clusterId] })
    },
  })
}

/** All reactions on messages in a cluster (message_reactions has no cluster column). */
export function useClusterReactions(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['cluster-reactions', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data: messages, error: mErr } = await supabase
        .from('messages')
        .select('id')
        .eq('cluster_id', clusterId)
      if (mErr) throw mErr
      const ids = (messages ?? []).map((m) => m.id)
      if (ids.length === 0) return [] as Reaction[]
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', ids)
      if (error) throw error
      return (data ?? []) as Reaction[]
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

/** A member's last N moods in a cluster (profile "mood history"). */
export function useMemberMoods(clusterId: string | null, memberId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['member-moods', clusterId ?? 'none', memberId ?? 'none'],
    enabled: enabled && clusterId !== null && memberId !== null,
    queryFn: async () => {
      if (!clusterId || !memberId) throw new Error('No cluster or member')
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('moods')
        .select('mood, created_at')
        .eq('cluster_id', clusterId)
        .eq('user_id', memberId)
        .order('created_at', { ascending: false })
        .limit(7)
      if (error) throw error
      return data ?? []
    },
  })
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

export type { Message, MoodRow, Profile, Reaction }
export type { MatchingMode }
