import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

export type AppealStatus = Database['public']['Enums']['appeal_status']
export type AppealRow = Database['public']['Functions']['get_my_appeal']['Returns'][number]
export type AdminAppealListRow = Database['public']['Functions']['list_appeals_page']['Returns'][number]
export type AdminAppealRow = Database['public']['Functions']['get_admin_appeal']['Returns'][number]

export const APPEAL_STATUS_LABELS: Record<AppealStatus, string> = {
  submitted: 'Under review',
  resolved: 'Resolved',
}

type RpcError = { message: string; code?: string } | null

function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = requireSupabase()
  return (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: RpcError }>)(
    name,
    args,
  )
}

/** The signed-in user's appeals, newest first (get_my_appeal). */
export function useMyAppeal() {
  return useQuery({
    queryKey: ['appeals', 'mine'],
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_my_appeal')
      if (error) throw error
      return (data ?? []) as AppealRow[]
    },
  })
}

export function useSubmitAppeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (details: string) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('submit_appeal', { p_details: details })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appeals'] })
    },
  })
}

export interface AdminAppealsFilters {
  status: AppealStatus | 'all'
  page: number
  pageSize: number
}

/** Admin appeal queue, paginated, filterable by status (list_appeals_page). */
export function useAdminAppeals(filters: AdminAppealsFilters) {
  const status = filters.status === 'all' ? undefined : filters.status
  return useQuery({
    queryKey: ['admin', 'appeals', status ?? 'all', filters.page, filters.pageSize],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('list_appeals_page', {
        p_status: status,
        p_limit: filters.pageSize,
        p_offset: (filters.page - 1) * filters.pageSize,
      })
      if (error) throw error
      return (data ?? []) as AdminAppealListRow[]
    },
  })
}

export function useAdminAppeal(appealId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'appeals', appealId],
    enabled: appealId != null,
    queryFn: async () => {
      if (!appealId) throw new Error('No appeal id')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_admin_appeal', { p_appeal_id: appealId })
      if (error) throw error
      return (data?.[0] ?? null) as AdminAppealRow | null
    },
  })
}

export function useDecideAppeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { p_appeal_id: string; p_accept: boolean; p_response: string }) => {
      const { error } = await callRpc('decide_appeal', args)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] })
      void queryClient.invalidateQueries({ queryKey: ['appeals'] })
      void queryClient.invalidateQueries({ queryKey: ['access'] })
      void queryClient.invalidateQueries({ queryKey: ['moderation'] })
    },
  })
}