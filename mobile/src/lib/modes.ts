import { Cake, CalendarCheck, CalendarDays, MapPin, Shuffle, Users } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'

/** Mirrors the `matching_mode` enum in 001_enums.sql (+ 0131 open_mix, + 0146 generation).
 * `birth_month` stays in the union as deprecated: the Postgres value is retained
 * (0147 retires it via guard + cleanup, never a type rebuild), so database rows
 * still typecheck. It has no `MATCHING_MODES` entry, so `isMatchingMode` rejects
 * it and it never renders a tile. */
export type MatchingMode =
  | 'exact_birthdate'
  | 'birth_year_month'
  | 'generation'
  | 'birth_year'
  | 'local'
  | 'open_mix'
  | 'birth_month'

export interface ModeInfo {
  value: MatchingMode
  label: string
  detail: string
  icon: LucideIcon
}

export const MATCHING_MODES: ModeInfo[] = [
  { value: 'exact_birthdate', label: 'Exact Birthdate', detail: 'Born on the same day, month, and year', icon: Cake },
  { value: 'birth_year_month', label: 'Birth Year + Month', detail: 'Born in the same month and year', icon: CalendarDays },
  { value: 'generation', label: 'Generation', detail: 'Born within the same 5 years', icon: Users },
  { value: 'birth_year', label: 'Birth Year', detail: 'Born in the same year, any month', icon: CalendarCheck },
  { value: 'local', label: 'Local', detail: 'Within a radius you choose', icon: MapPin },
  { value: 'open_mix', label: 'Open Mix', detail: 'First 8 in, no birth-date or location filter', icon: Shuffle },
]

export function modeInfo(value: MatchingMode): ModeInfo {
  const info = MATCHING_MODES.find((m) => m.value === value)
  if (!info) throw new Error(`Unknown matching mode: ${value}`)
  return info
}

export function isMatchingMode(value: string): value is MatchingMode {
  return MATCHING_MODES.some((m) => m.value === value)
}

/** Mirrors `fn_cooldown_interval` in 0132: 7 days for open_mix, 30 for the rest. */
export function cooldownDaysForMode(mode: MatchingMode): 7 | 30 {
  return mode === 'open_mix' ? 7 : 30
}
