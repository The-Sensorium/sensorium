import type { Database } from './database.types'

export type Availability = Database['public']['Enums']['availability']

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
