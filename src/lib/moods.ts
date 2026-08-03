import type { Database } from './database.types'

export type Mood = Database['public']['Enums']['mood']
export type Availability = Database['public']['Enums']['availability']

export interface MoodMeta {
  value: Mood
  emoji: string
  label: string
}

/** Mirrors the `mood` enum in 001_enums.sql; emoji per PRD. */
export const MOODS: MoodMeta[] = [
  { value: 'great', emoji: '😀', label: 'Great' },
  { value: 'good', emoji: '🙂', label: 'Good' },
  { value: 'okay', emoji: '😐', label: 'Okay' },
  { value: 'low', emoji: '😔', label: 'Low' },
  { value: 'stressed', emoji: '😩', label: 'Stressed' },
]

export function moodMeta(mood: Mood): MoodMeta {
  const meta = MOODS.find((m) => m.value === mood)
  if (!meta) return { value: mood, emoji: '😐', label: mood }
  return meta
}

export interface AvailabilityMeta {
  value: Availability
  label: string
  dotClass: string
}

export const AVAILABILITY: AvailabilityMeta[] = [
  { value: 'available', label: 'Available', dotClass: 'bg-emerald-500' },
  { value: 'busy', label: 'Busy', dotClass: 'bg-amber-500' },
  { value: 'dnd', label: 'Do not disturb', dotClass: 'bg-red-500' },
]

export function availabilityMeta(value: Availability): AvailabilityMeta {
  const meta = AVAILABILITY.find((a) => a.value === value)
  if (!meta) return { value, label: value, dotClass: 'bg-on-surface-variant/40' }
  return meta
}
