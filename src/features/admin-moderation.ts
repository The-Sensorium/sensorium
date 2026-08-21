import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

export type ReportStatus = Database['public']['Enums']['report_status']
export type PlatformRole = Database['public']['Enums']['platform_role']
export type AccountStatus = Database['public']['Enums']['account_status']
export type ModerationAuditRow = Database['public']['Functions']['get_moderation_audit']['Returns'][number]
export type ModerationQueueRow = Database['public']['Functions']['get_moderation_queue']['Returns'][number]
export type ModerationReportRow = Database['public']['Functions']['get_moderation_report']['Returns'][number]
export type PlatformRolePageRow = Database['public']['Functions']['list_platform_roles_page']['Returns'][number]
export type ModeratedMessageRow = Database['public']['Functions']['get_moderation_message']['Returns'][number]
export type AccountSearchRow = Database['public']['Functions']['search_accounts']['Returns'][number]

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  actioned: 'Actioned',
  dismissed: 'Dismissed',
}

export const REPORT_STATUS_ORDER: ReportStatus[] = ['pending', 'reviewing', 'actioned', 'dismissed']

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  moderator: 'Moderator',
  admin: 'Admin',
}

export function moderationKey() {
  return ['moderation'] as const
}

/** Moderator report queue, paginated via cursor keys, filtered by status/assignee. */
export function useModerationQueue({
  status,
  limit = 25,
}: {
  status?: ReportStatus
  limit?: number
}) {
  return useInfiniteQuery({
    queryKey: ['moderation', 'queue', status ?? 'all', limit],
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_queue', {
        p_status: status,
        p_limit: limit,
        p_cursor_created_at: pageParam?.created_at ?? undefined,
        p_cursor_id: pageParam?.id ?? undefined,
      })
      if (error) throw error
      return (data ?? []) as ModerationQueueRow[]
    },
    getNextPageParam: (lastPage) => {
      const last = lastPage[lastPage.length - 1]
      if (!last || lastPage.length < limit) return undefined
      return { created_at: last.created_at, id: last.id }
    },
  })
}

export function useModerationReport(reportId: string | undefined) {
  return useQuery({
    queryKey: ['moderation', 'report', reportId],
    enabled: reportId != null,
    queryFn: async () => {
      if (!reportId) throw new Error('No report id')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_report', { p_report_id: reportId })
      if (error) throw error
      return (data?.[0] ?? null) as ModerationReportRow | null
    },
  })
}

export function useModeratedMessage(reportId: string | undefined) {
  return useQuery({
    queryKey: ['moderation', 'message', reportId],
    enabled: reportId != null,
    queryFn: async () => {
      if (!reportId) throw new Error('No report id')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_message', { p_report_id: reportId })
      if (error) throw error
      return (data?.[0] ?? null) as ModeratedMessageRow | null
    },
  })
}

type RpcCaller = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ error: { message: string; code?: string } | null }>

function callRpc<TArgs extends object>(rpc: string, args: TArgs) {
  const supabase = requireSupabase()
  return (supabase.rpc as unknown as RpcCaller)(rpc, args as Record<string, unknown>)
}

function useModerationMutation<TArgs extends object>(rpc: string, extraKeys: (string | number)[][]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const { error } = await callRpc(rpc, args)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moderationKey() })
      for (const key of extraKeys) void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

function useSanctionMutation(rpc: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      p_user_id: string
      p_reason: string
      p_status?: AccountStatus
      p_expires_at?: string
      p_report_id?: string
    }) => {
      const { error } = await callRpc(rpc, args)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moderationKey() })
      void queryClient.invalidateQueries({ queryKey: ['access'] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export function useClaimReport() {
  return useModerationMutation<{ p_report_id: string }>('claim_moderation_report', [])
}

export function useReleaseReport() {
  return useModerationMutation<{ p_report_id: string }>('release_moderation_report', [])
}

export function useResolveReport() {
  return useModerationMutation<{
    p_report_id: string
    p_status: ReportStatus
    p_note?: string
    p_action?: Record<string, unknown>
  }>('resolve_moderation_report', [])
}

export function useHideMessage() {
  return useModerationMutation<{ p_message_id: string; p_reason: string; p_report_id?: string }>('hide_message', [
    ['moderation', 'message'],
  ])
}

export function useRestoreMessage() {
  return useModerationMutation<{ p_message_id: string; p_reason: string; p_report_id?: string }>('restore_message', [
    ['moderation', 'message'],
  ])
}

export function useIssueWarning() {
  return useSanctionMutation('issue_warning')
}

export function useApplyRestriction() {
  return useSanctionMutation('apply_account_restriction')
}

export function useGrantRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { p_user_id: string; p_role: PlatformRole; p_reason: string }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('grant_platform_role', args)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['moderation', 'roles'] })
      void queryClient.invalidateQueries({ queryKey: ['access'] })
      void queryClient.invalidateQueries({ queryKey: moderationKey() })
    },
  })
}

export function useRevokeRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { p_user_id: string; p_role: PlatformRole; p_reason: string }) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('revoke_platform_role', args)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['moderation', 'roles'] })
      void queryClient.invalidateQueries({ queryKey: ['access'] })
      void queryClient.invalidateQueries({ queryKey: moderationKey() })
    },
  })
}

export function useRoleAssignments(filters: RoleAssignmentsFilters) {
  return useQuery({
    queryKey: ['moderation', 'roles', 'page', filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('list_platform_roles_page', {
        p_include_revoked: filters.includeRevoked,
        p_role: filters.role === 'all' ? undefined : filters.role,
        p_query: filters.search || undefined,
        p_limit: filters.pageSize,
        p_offset: (filters.page - 1) * filters.pageSize,
      })
      if (error) throw error
      return (data ?? []) as PlatformRolePageRow[]
    },
  })
}

export interface RoleAssignmentsFilters {
  search: string
  role: PlatformRole | 'all'
  includeRevoked: boolean
  page: number
  pageSize: number
}

export function useAccountSearch(query: string) {
  const normalized = query.trim()
  return useQuery({
    queryKey: ['moderation', 'account-search', normalized],
    enabled: normalized.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('search_accounts', { p_query: normalized })
      if (error) throw error
      return (data ?? []) as AccountSearchRow[]
    },
  })
}

export function useModerationAudit(limit = 100) {
  return useInfiniteQuery({
    queryKey: ['moderation', 'audit', limit],
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_audit', {
        p_limit: limit,
        p_cursor_created_at: pageParam?.created_at ?? undefined,
        p_cursor_id: pageParam?.id ?? undefined,
      })
      if (error) throw error
      return (data ?? []) as ModerationAuditRow[]
    },
    getNextPageParam: (lastPage) => {
      const last = lastPage[lastPage.length - 1]
      if (!last || lastPage.length < limit) return undefined
      return { created_at: last.created_at, id: last.id }
    },
  })
}

export function formatError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)
  if (message.includes('last_admin_required')) return 'Action blocked: you cannot remove the last active admin.'
  if (message.includes('cannot_grant_self')) return 'Action blocked: you cannot assign a role to yourself.'
  if (message.includes('cannot_revoke_self')) return 'Action blocked: you cannot revoke your own role.'
  if (message.includes('already_assigned')) return 'That role is already assigned to this user.'
  if (message.includes('user_not_found')) return 'No account found with that email address.'
  if (message.includes('insufficient_permission')) return 'Your account no longer has permission for this action.'
  if (message.includes('account_inactive')) return 'Your account is restricted and you can\u2019t perform staff actions right now.'
  if (message.includes('cannot_unban')) return 'Only an admin can lift a permanent ban.'
  if (message.includes('cannot_restrict_staff')) return 'Only an admin can suspend a staff member.'
  if (message.includes('expiry_required')) return 'A temporary suspension needs an end date.'
  if (message.includes('suspension_too_long') || message.includes('restriction_limit'))
    return 'Temporary suspensions are limited to 7 days.'
  if (message.includes('cannot_resolve_not_assigned_to_you'))
    return 'Only the moderator assigned to this case can resolve it.'
  if (message.includes('restriction_not_active')) return 'That account is already active; there is nothing to lift.'
  if (message.includes('report_message_mismatch'))
    return 'That action does not match the message reported in this case.'
  if (message.includes('report_target_mismatch'))
    return 'That action does not match the account reported in this case.'
  if (message.includes('report_not_open')) return 'That report is already closed.'
  if (message.includes('appeal_not_found')) return 'That appeal could not be found.'
  if (message.includes('appeal_already_resolved')) return 'That appeal has already been decided.'
  if (message.includes('response_required')) return 'A response for the appellant is required.'
  if (message.includes('response_too_long')) return 'Responses are limited to 2,000 characters.'
  return message
}
