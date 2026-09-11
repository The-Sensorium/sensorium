import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'
import { moderationKey } from './admin-moderation'

export type StaffAccountRow = Database['public']['Functions']['search_accounts_v2']['Returns'][number]
export type StaffAccountDetail = Database['public']['Functions']['get_staff_account_detail']['Returns'][number]
export type AccountHistoryEntry =
  Database['public']['Functions']['get_account_moderation_history']['Returns'][number]

export function staffBaseFromPath(pathname: string): '/admin' | '/moderator' {
  return pathname.startsWith('/moderator') ? '/moderator' : '/admin'
}

export function useStaffBase(): '/admin' | '/moderator' {
  const { pathname } = useLocation()
  return staffBaseFromPath(pathname)
}

export function useStaffAccountSearch(query: string, limit = 8) {
  const normalized = query.trim()
  return useQuery({
    queryKey: ['moderation', 'account-search-v2', normalized, limit],
    enabled: normalized.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('search_accounts_v2', { p_query: normalized, p_limit: limit })
      if (error) throw error
      return (data ?? []) as StaffAccountRow[]
    },
  })
}

export function useStaffAccountDetail(userId: string | undefined) {
  return useQuery({
    queryKey: ['moderation', 'account', userId],
    enabled: userId != null,
    queryFn: async () => {
      if (!userId) throw new Error('No user id')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_staff_account_detail', { p_user_id: userId })
      if (error) throw error
      return (data?.[0] ?? null) as StaffAccountDetail | null
    },
  })
}

export function useAccountHistory(userId: string | undefined, limit = 25) {
  return useInfiniteQuery({
    queryKey: ['moderation', 'account-history', userId, limit],
    enabled: userId != null,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      if (!userId) throw new Error('No user id')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_account_moderation_history', {
        p_user_id: userId,
        p_limit: limit,
        p_cursor: pageParam ?? null,
      })
      if (error) throw error
      return (data ?? []) as AccountHistoryEntry[]
    },
    getNextPageParam: (lastPage) => {
      const last = lastPage[lastPage.length - 1]
      if (!last || lastPage.length < limit) return undefined
      return { created_at: last.created_at, id: last.entry_id }
    },
  })
}

export function useLiftRestriction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { p_user_id: string; p_reason: string }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('lift_account_restriction', args)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moderationKey() })
      void queryClient.invalidateQueries({ queryKey: ['access'] })
    },
  })
}
