import { Cake, Calendar, CalendarCheck, CalendarDays, MapPin, Shuffle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Mirrors the `matching_mode` enum in 001_enums.sql (+ 0131 open_mix). */
export type MatchingMode =
  | 'exact_birthdate'
  | 'birth_year_month'
  | 'birth_month'
  | 'birth_year'
  | 'local'
  | 'open_mix'

export interface ModeInfo {
  value: MatchingMode
  label: string
  detail: string
  icon: LucideIcon
}

export const MATCHING_MODES: ModeInfo[] = [
  { value: 'exact_birthdate', label: 'Exact Birthdate', detail: 'Born on the same day, month, and year', icon: Cake },
  { value: 'birth_year_month', label: 'Birth Year + Month', detail: 'Born in the same month and year', icon: CalendarDays },
  { value: 'birth_month', label: 'Birth Month', detail: 'Born in the same month, any year', icon: Calendar },
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
