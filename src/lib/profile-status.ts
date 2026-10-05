import type { Database } from './database.types'

export type ProfileStatus = Database['public']['Enums']['profile_status']

export interface ProfileStatusMeta {
  value: ProfileStatus
  label: string
  description: string
  dotClass: string
  dotHex: string
}

export const DEFAULT_PROFILE_STATUS: ProfileStatus = 'online'

export const PROFILE_STATUSES: ProfileStatusMeta[] = [
  {
    value: 'online',
    label: 'Online',
    description: "You're active and available.",
    dotClass: 'bg-emerald-500 dark:bg-emerald-400',
    dotHex: '#22c55e',
  },
  {
    value: 'away',
    label: 'Away',
    description: 'You might be away from your device.',
    dotClass: 'bg-amber-500 dark:bg-amber-400',
    dotHex: '#f59e0b',
  },
  {
    value: 'busy',
    label: 'Busy',
    description: "You're available, but might not reply quickly.",
    dotClass: 'bg-red-500 dark:bg-red-400',
    dotHex: '#ef4444',
  },
  {
    value: 'invisible',
    label: 'Invisible',
    description: 'Stay off the radar, but you can still use the app.',
    dotClass: 'bg-gray-400 dark:bg-gray-500',
    dotHex: '#9ca3af',
  },
]

export function profileStatusMeta(value: ProfileStatus): ProfileStatusMeta {
  const meta = PROFILE_STATUSES.find((s) => s.value === value)
  if (!meta) return { value, label: value, description: '', dotClass: 'bg-gray-400 dark:bg-gray-500', dotHex: '#9ca3af' }
  return meta
}

export function isProfileStatus(value: string | null | undefined): value is ProfileStatus {
  return PROFILE_STATUSES.some((s) => s.value === value)
}

/** What other members should see for a person. Technical presence wins: a
 *  person who is not actually online always reads as offline, no matter what
 *  manual status they picked, and Invisible reads as offline even while they
 *  are using the app. Avatar dots use the same rule (visible only when the
 *  result is not offline). */
export type DisplayStatus = ProfileStatus | 'offline'

export function resolveDisplayStatus(
  onlineNow: boolean,
  manual: string | null | undefined,
): DisplayStatus {
  if (!onlineNow) return 'offline'
  const status = isProfileStatus(manual) ? manual : DEFAULT_PROFILE_STATUS
  return status === 'invisible' ? 'offline' : status
}
