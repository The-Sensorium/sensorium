import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

export type ReportStatus = Database['public']['Enums']['report_status']
export type PlatformRole = Database['public']['Enums']['platform_role']
export type AccountStatus = Database['public']['Enums']['account_status']
export type ModerationSeverity = Database['public']['Enums']['moderation_severity']
export type ReportReason = Database['public']['Enums']['report_reason']
export type ModerationAuditRow = Database['public']['Functions']['get_moderation_audit']['Returns'][number]
export type ModerationQueueRow = Database['public']['Functions']['get_moderation_queue']['Returns'][number]
export type ModerationQueueV2Row = Database['public']['Functions']['get_moderation_queue_v2']['Returns'][number]
export type StaffModerationSummary = Database['public']['Functions']['get_staff_moderation_summary']['Returns'][number]
export type ModerationReportRow = Database['public']['Functions']['get_moderation_report']['Returns'][number]
export type ModerationCaseV2Row = Database['public']['Functions']['get_moderation_case_v2']['Returns'][number]
export type CaseTimelineEntry = Database['public']['Functions']['get_moderation_case_timeline']['Returns'][number]

export interface ReporterSummary {
  id: string | null
  display_name: string | null
  account_created_at: string | null
  reports_30d: number
  total_reports: number
  dismissed_reports: number
}

export interface TargetSummary {
  id: string | null
  display_name: string | null
  account_status: string
  restriction_expires_at: string | null
  restriction_reason: string | null
  roles: string[]
  cluster_names: string[]
  prior_reports: number
  prior_actions: number
}

function parseSummary<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'object' || value === null) return fallback
  return { ...fallback, ...(value as Record<string, unknown>) } as T
}

const EMPTY_REPORTER: ReporterSummary = {
  id: null,
  display_name: null,
  account_created_at: null,
  reports_30d: 0,
  total_reports: 0,
  dismissed_reports: 0,
}

const EMPTY_TARGET: TargetSummary = {
  id: null,
  display_name: null,
  account_status: 'active',
  restriction_expires_at: null,
  restriction_reason: null,
  roles: [],
  cluster_names: [],
  prior_reports: 0,
  prior_actions: 0,
}

export interface PostSummary {
  id: string | null
  title: string | null
  content: string | null
  image_path: string | null
  gif_url: string | null
  author_id: string | null
  author_display_name: string | null
  cluster_id: string | null
  cluster_name: string | null
  moderation_status: string | null
  deleted_at: string | null
  created_at: string | null
}

export interface CommentSummary {
  id: string | null
  content: string | null
  image_path: string | null
  gif_url: string | null
  author_id: string | null
  author_display_name: string | null
  post_id: string | null
  post_title: string | null
  post_snippet: string | null
  moderation_status: string | null
  deleted_at: string | null
  created_at: string | null
}

const EMPTY_POST: PostSummary = {
  id: null,
  title: null,
  content: null,
  image_path: null,
  gif_url: null,
  author_id: null,
  author_display_name: null,
  cluster_id: null,
  cluster_name: null,
  moderation_status: null,
  deleted_at: null,
  created_at: null,
}

const EMPTY_COMMENT: CommentSummary = {
  id: null,
  content: null,
  image_path: null,
  gif_url: null,
  author_id: null,
  author_display_name: null,
  post_id: null,
  post_title: null,
  post_snippet: null,
  moderation_status: null,
  deleted_at: null,
  created_at: null,
}

export function postSummary(row: ModerationCaseV2Row): PostSummary | null {
  if (row.post == null) return null
  return parseSummary(row.post, EMPTY_POST)
}

export function commentSummary(row: ModerationCaseV2Row): CommentSummary | null {
  if (row.comment == null) return null
  return parseSummary(row.comment, EMPTY_COMMENT)
}

export function reporterSummary(row: ModerationCaseV2Row): ReporterSummary {
  return parseSummary(row.reporter, EMPTY_REPORTER)
}

export function targetSummary(row: ModerationCaseV2Row): TargetSummary {
  return parseSummary(row.target, EMPTY_TARGET)
}
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

export const MODERATION_SEVERITY_LABELS: Record<ModerationSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const MODERATION_SEVERITY_ORDER: ModerationSeverity[] = ['urgent', 'high', 'medium', 'low']

export type TargetKind = 'member' | 'message' | 'post' | 'comment'

export const TARGET_KIND_LABELS: Record<TargetKind, string> = {
  member: 'Member',
  message: 'Message',
  post: 'Post',
  comment: 'Comment',
}

export function isBreached(dueAt: string | null, status: ReportStatus): boolean {
  return dueAt != null && (status === 'pending' || status === 'reviewing') && new Date(dueAt).getTime() < Date.now()
}

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  moderator: 'Moderator',
  admin: 'Admin',
}

export function moderationKey() {
  return ['moderation'] as const
}

/** Moderator report queue, paginated via cursor keys, filtered by status/assignee. */
export type QueueOrder = 'asc' | 'desc'

export function useModerationQueue({
  status,
  order = 'desc',
  limit = 25,
}: {
  status?: ReportStatus
  order?: QueueOrder
  limit?: number
}) {
  return useInfiniteQuery({
    queryKey: ['moderation', 'queue', status ?? 'all', order, limit],
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_queue', {
        p_status: status,
        p_order: order,
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

export type QueueV2Sla = 'breached' | 'open' | 'closed' | 'all' | 'all_open'

export interface QueueV2Filters {
  status?: ReportStatus
  assignee?: string
  targetKind?: TargetKind
  reason?: ReportReason
  severity?: ModerationSeverity
  sla?: QueueV2Sla
  search?: string
  order?: QueueOrder
}

export type AdminOpsHealth = Database['public']['Functions']['get_admin_ops_health']['Returns'][number]

export function useAdminOpsHealth(enabled = true) {
  return useQuery({
    queryKey: ['moderation', 'ops-health'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_admin_ops_health')
      if (error) throw error
      return (data?.[0] ?? null) as AdminOpsHealth | null
    },
  })
}

export function useStaffModerationSummary() {
  return useQuery({
    queryKey: ['moderation', 'summary'],
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_staff_moderation_summary')
      if (error) throw error
      return (data?.[0] ?? null) as StaffModerationSummary | null
    },
  })
}

export function useModerationQueueV2(filters: QueueV2Filters, limit = 25) {
  const normalized = {
    status: filters.status ?? null,
    assignee: filters.assignee ?? 'all',
    target_kind: filters.targetKind ?? null,
    reason: filters.reason ?? null,
    severity: filters.severity ?? null,
    sla: filters.sla ?? 'all_open',
    search: filters.search?.trim() ? filters.search.trim() : null,
    order: filters.order ?? 'desc',
  }
  return useInfiniteQuery({
    queryKey: ['moderation', 'queue-v2', normalized, limit],
    placeholderData: keepPreviousData,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_queue_v2', {
        p_filters: normalized,
        p_limit: limit,
        p_cursor: pageParam ?? null,
      })
      if (error) throw error
      return (data ?? []) as ModerationQueueV2Row[]
    },
    getNextPageParam: (lastPage) => {
      const last = lastPage[lastPage.length - 1]
      if (!last || lastPage.length < limit) return undefined
      return { created_at: last.created_at, id: last.id }
    },
  })
}

export function useModerationCaseV2(reportId: string | undefined) {
  return useQuery({
    queryKey: ['moderation', 'case-v2', reportId],
    enabled: reportId != null,
    queryFn: async () => {
      if (!reportId) throw new Error('No report id')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_case_v2', { p_report_id: reportId })
      if (error) throw error
      return (data?.[0] ?? null) as ModerationCaseV2Row | null
    },
  })
}

export function useCaseTimeline(reportId: string | undefined) {
  return useQuery({
    queryKey: ['moderation', 'timeline', reportId],
    enabled: reportId != null,
    queryFn: async () => {
      if (!reportId) throw new Error('No report id')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_case_timeline', { p_report_id: reportId })
      if (error) throw error
      return (data ?? []) as CaseTimelineEntry[]
    },
  })
}

export function useAddCaseNote() {
  return useModerationMutation<{ p_report_id: string; p_note: string }>('add_moderation_case_note', [
    ['moderation', 'timeline'],
  ])
}

export function useEditCaseNote() {
  return useModerationMutation<{ p_note_id: string; p_note: string }>('edit_moderation_case_note', [
    ['moderation', 'timeline'],
  ])
}

export function useDeleteCaseNote() {
  return useModerationMutation<{ p_note_id: string }>('delete_moderation_case_note', [
    ['moderation', 'timeline'],
  ])
}

export function useAssignCase() {
  return useModerationMutation<{ p_report_id: string; p_assignee: string; p_reason: string }>(
    'assign_moderation_case',
    [],
  )
}

export function useEscalateCase() {
  return useModerationMutation<{ p_report_id: string; p_reason: string }>('escalate_moderation_case', [])
}

export function useSetCaseSeverity() {
  return useModerationMutation<{ p_report_id: string; p_severity: ModerationSeverity; p_reason: string }>(
    'set_moderation_case_severity',
    [],
  )
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

export type PolicyTemplateRow =
  Database['public']['Functions']['list_moderation_policies']['Returns'][number]

export function useModerationPolicies() {
  return useQuery({
    queryKey: ['moderation', 'policies'],
    staleTime: 300_000,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('list_moderation_policies')
      if (error) throw error
      return (data ?? []) as PolicyTemplateRow[]
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
      p_policy_code?: string
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

export function useHidePost() {
  return useModerationMutation<{ p_post_id: string; p_reason: string; p_report_id?: string }>('hide_post', [])
}

export function useRestorePost() {
  return useModerationMutation<{ p_post_id: string; p_reason: string; p_report_id?: string }>('restore_post', [])
}

export function useHidePostComment() {
  return useModerationMutation<{ p_comment_id: string; p_reason: string; p_report_id?: string }>(
    'hide_post_comment',
    [],
  )
}

export function useRestorePostComment() {
  return useModerationMutation<{ p_comment_id: string; p_reason: string; p_report_id?: string }>(
    'restore_post_comment',
    [],
  )
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

export type ModerationAuditV2Row =
  Database['public']['Functions']['get_moderation_audit_v2']['Returns'][number]

export type ModerationActionType = Database['public']['Enums']['moderation_action_type']

export interface AuditV2Filters {
  action?: ModerationActionType
  actorId?: string
  targetId?: string
  reportId?: string
  appealId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && UUID_RE.test(trimmed) ? trimmed : null
}

export function useModerationAuditV2(filters: AuditV2Filters, limit = 100) {
  const normalized = {
    action: filters.action ?? null,
    actor_id: uuidOrNull(filters.actorId),
    target_id: uuidOrNull(filters.targetId),
    report_id: uuidOrNull(filters.reportId),
    appeal_id: uuidOrNull(filters.appealId),
    date_from: filters.dateFrom?.trim() ? new Date(`${filters.dateFrom}T00:00:00`).toISOString() : null,
    date_to: filters.dateTo?.trim() ? new Date(`${filters.dateTo}T23:59:59`).toISOString() : null,
    search: filters.search?.trim() ? filters.search.trim() : null,
  }
  return useInfiniteQuery({
    queryKey: ['moderation', 'audit-v2', normalized, limit],
    placeholderData: keepPreviousData,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_moderation_audit_v2', {
        p_filters: normalized,
        p_limit: limit,
        p_cursor: pageParam ?? null,
      })
      if (error) throw error
      return (data ?? []) as ModerationAuditV2Row[]
    },
    getNextPageParam: (lastPage) => {
      const last = lastPage[lastPage.length - 1]
      if (!last || lastPage.length < limit) return undefined
      return { created_at: last.created_at, id: last.id }
    },
  })
}

export function auditRowsToCsv(rows: ModerationAuditV2Row[]): string {
  const escape = (value: string | null): string => {
    const text = value ?? ''
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = 'id,created_at,action,actor_id,actor,target_user_id,target,report_id,appeal_id,reason'
  const lines = rows.map((row) =>
    [
      row.id,
      row.created_at,
      row.action,
      row.actor_id,
      row.actor_display_name,
      row.target_user_id,
      row.target_display_name,
      row.report_id,
      row.appeal_id,
      row.reason,
    ]
      .map((cell) => escape(cell))
      .join(','),
  )
  return [header, ...lines].join('\n')
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
  if (message.includes('note_required')) return 'Write the note before saving it.'
  if (message.includes('note_too_long')) return 'Notes are limited to 2,000 characters.'
  if (message.includes('note_not_found')) return 'That note could not be found.'
  if (message.includes('note_deleted')) return 'That note has already been deleted.'
  if (message.includes('reason_required')) return 'A short reason is required so the audit trail stays useful.'
  if (message.includes('reason_too_long')) return 'Reasons are limited to 2,000 characters.'
  if (message.includes('assignee_not_staff')) return 'Cases can only be assigned to moderators or admins.'
  if (message.includes('cannot_escalate_not_assigned_to_you'))
    return 'Only the assigned moderator or an admin can escalate this case.'
  if (message.includes('cannot_retriage_not_assigned_to_you'))
    return 'Only the assigned moderator or an admin can change severity.'
  if (message.includes('report_post_mismatch'))
    return 'That action does not match the post reported in this case.'
  if (message.includes('report_comment_mismatch'))
    return 'That action does not match the comment reported in this case.'
  if (message.includes('post_not_found_or_already_hidden')) return 'That post is already hidden or no longer exists.'
  if (message.includes('post_not_found_or_not_hidden')) return 'That post is not hidden or no longer exists.'
  if (message.includes('comment_not_found_or_already_hidden'))
    return 'That comment is already hidden or no longer exists.'
  if (message.includes('comment_not_found_or_not_hidden')) return 'That comment is not hidden or no longer exists.'
  if (message.includes('invalid_policy_code')) return 'Choose a valid policy category for this action.'
  if (message.includes('report_not_open')) return 'That report is already closed.'
  if (message.includes('appeal_not_found')) return 'That appeal could not be found.'
  if (message.includes('appeal_already_resolved')) return 'That appeal has already been decided.'
  if (message.includes('response_required')) return 'A response for the appellant is required.'
  if (message.includes('response_too_long')) return 'Responses are limited to 2,000 characters.'
  return message
}
