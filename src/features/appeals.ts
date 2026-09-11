import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export type QueueOrder = 'asc' | 'desc'

export interface AdminAppealsFilters {
  status: AppealStatus | 'all'
  order: QueueOrder
  page: number
  pageSize: number
}

/** Admin appeal queue, paginated, filterable by status (list_appeals_page). */
export function useAdminAppeals(filters: AdminAppealsFilters) {
  const status = filters.status === 'all' ? undefined : filters.status
  return useQuery({
    queryKey: ['admin', 'appeals', status ?? 'all', filters.order, filters.page, filters.pageSize],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('list_appeals_page', {
        p_status: status,
        p_order: filters.order,
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
    mutationFn: async (args: {
      p_appeal_id: string
      p_accept: boolean
      p_response: string
      p_internal_note?: string
      p_decision_reason_code?: string
      p_second_review_confirmed?: boolean
    }) => {
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

export type AdminAppealV2Row = Database['public']['Functions']['get_admin_appeal_v2']['Returns'][number]
export type AppealsPageV2Row = Database['public']['Functions']['list_appeals_page_v2']['Returns'][number]

export interface OriginalAction {
  id: string | null
  action: string | null
  reason: string | null
  policy_code: string | null
  actor_display_name: string | null
  created_at: string | null
}

export interface AppellantSummary {
  account_status: string
  restriction_expires_at: string | null
  restriction_reason: string | null
  roles: string[]
  cluster_names: string[]
  prior_reports: number
  prior_actions: number
}

export interface RecentReport {
  id: string
  reason: string
  status: string
  created_at: string
}

function parseSummary<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'object' || value === null) return fallback
  return { ...fallback, ...(value as Record<string, unknown>) } as T
}

const EMPTY_ACTION: OriginalAction = {
  id: null,
  action: null,
  reason: null,
  policy_code: null,
  actor_display_name: null,
  created_at: null,
}

const EMPTY_APPELLANT: AppellantSummary = {
  account_status: 'active',
  restriction_expires_at: null,
  restriction_reason: null,
  roles: [],
  cluster_names: [],
  prior_reports: 0,
  prior_actions: 0,
}

export function originalAction(row: AdminAppealV2Row): OriginalAction | null {
  if (row.original_action == null) return null
  return parseSummary(row.original_action, EMPTY_ACTION)
}

export function appellantSummary(row: AdminAppealV2Row): AppellantSummary {
  return parseSummary(row.appellant, EMPTY_APPELLANT)
}

export function recentReports(row: AdminAppealV2Row): RecentReport[] {
  if (!Array.isArray(row.recent_reports)) return []
  return (row.recent_reports as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ''),
    reason: String(r.reason ?? ''),
    status: String(r.status ?? ''),
    created_at: String(r.created_at ?? ''),
  }))
}

export function isAppealOverdue(reviewDueAt: string | null, status: AppealStatus): boolean {
  return (
    reviewDueAt != null && status === 'submitted' && new Date(reviewDueAt).getTime() < Date.now()
  )
}

export interface AppealsV2Filters {
  status?: AppealStatus
  assignee?: string
  sla?: string
  order?: QueueOrder
}

export function useAppealsPageV2(filters: AppealsV2Filters, limit = 25) {
  const normalized = {
    status: filters.status ?? null,
    assignee: filters.assignee ?? 'all',
    sla: filters.sla ?? 'all_open',
    order: filters.order ?? 'desc',
  }
  return useInfiniteQuery({
    queryKey: ['admin', 'appeals-v2', normalized, limit],
    placeholderData: keepPreviousData,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('list_appeals_page_v2', {
        p_filters: normalized,
        p_limit: limit,
        p_cursor: pageParam ?? null,
      })
      if (error) throw error
      return (data ?? []) as AppealsPageV2Row[]
    },
    getNextPageParam: (lastPage) => {
      const last = lastPage[lastPage.length - 1]
      if (!last || lastPage.length < limit) return undefined
      return { created_at: last.created_at, id: last.id }
    },
  })
}

export function useAdminAppealV2(appealId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'appeals-v2', appealId],
    enabled: appealId != null,
    queryFn: async () => {
      if (!appealId) throw new Error('No appeal id')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_admin_appeal_v2', { p_appeal_id: appealId })
      if (error) throw error
      return (data?.[0] ?? null) as AdminAppealV2Row | null
    },
  })
}

function useAppealMutation<TArgs extends Record<string, unknown>>(rpc: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const { error } = await callRpc(rpc, args)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] })
      void queryClient.invalidateQueries({ queryKey: ['moderation'] })
    },
  })
}

export function useClaimAppeal() {
  return useAppealMutation<{ p_appeal_id: string }>('claim_appeal')
}

export function useReleaseAppeal() {
  return useAppealMutation<{ p_appeal_id: string }>('release_appeal')
}

export function useAssignAppeal() {
  return useAppealMutation<{ p_appeal_id: string; p_assignee: string; p_reason: string }>('assign_appeal')
}

export function useAddAppealNote() {
  return useAppealMutation<{ p_appeal_id: string; p_note: string }>('add_appeal_note')
}

export function useRequestSecondReview() {
  return useAppealMutation<{ p_appeal_id: string }>('request_appeal_second_review')
}

export function formatAppealError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)
  if (message.includes('cannot_claim_appeal')) return 'That appeal is already assigned or resolved.'
  if (message.includes('cannot_release_appeal')) return 'Only the admin assigned to this appeal can release it.'
  if (message.includes('assignee_not_admin')) return 'Appeals can only be assigned to admins.'
  if (message.includes('note_required')) return 'Write the note before saving it.'
  if (message.includes('note_too_long')) return 'Notes are limited to 2,000 characters.'
  if (message.includes('second_review_required'))
    return 'Rejecting a ban appeal needs a second admin review first — request one below.'
  if (message.includes('second_review_confirm_required'))
    return 'Confirm that a different admin already reviewed this rejection.'
  if (message.includes('invalid_policy_code')) return 'Choose a valid policy category for this decision.'
  return message
}