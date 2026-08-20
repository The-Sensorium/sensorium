import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

export type MyAccessRow = Database['public']['Functions']['get_my_access']['Returns'][number]

/** UI shell a signed-in user can occupy. The picked mode is never an
 * authorization boundary: protected RPCs authorize against database roles. */
export type SessionRole = 'member' | 'moderator' | 'admin'

export type Capability =
  | 'can_moderate'
  | 'can_apply_temporary_restriction'
  | 'can_manage_roles'
  | 'can_apply_permanent_restriction'
  | 'can_view_audit_log'

export const SESSION_ROLES: SessionRole[] = ['member', 'moderator', 'admin']

export function accessKey(userId: string) {
  return ['access', userId] as const
}

/** Signed-in user's platform access record (get_my_access). UI routing only. */
export function useMyAccess() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: accessKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_my_access')
      if (error) throw error
      return (data?.[0] ?? null) as MyAccessRow | null
    },
  })
}

export function hasCapability(access: MyAccessRow | null | undefined, cap: Capability): boolean {
  return access?.capabilities.includes(cap) ?? false
}

/** Roles the account may select right now, ordered member → admin. */
export function activeSessionRoles(access: MyAccessRow | null | undefined): SessionRole[] {
  const available = access?.available_session_roles ?? []
  return SESSION_ROLES.filter((r) => available.includes(r))
}

export function sessionRoleShell(role: SessionRole): string {
  return role === 'member' ? '/home' : `/${role}`
}

export const SESSION_ROLE_LABELS: Record<SessionRole, string> = {
  member: 'Member',
  moderator: 'Moderator',
  admin: 'Admin',
}

export const SESSION_ROLE_DESCRIPTIONS: Record<SessionRole, string> = {
  member: 'The existing Sensorium experience: your clusters, signals, and conversations.',
  moderator: 'The trust & safety workspace: reports, cases, and permitted account actions.',
  admin: 'Administration: moderation plus role management and the audit log.',
}