import type { MatchingMode } from '../../lib/modes'

export const LOCAL_RADII = [10, 50, 100] as const
export type LocalRadius = (typeof LOCAL_RADII)[number]

export interface OnboardingDraft {
  displayName: string
  dob: string
  countryCode: string
  photo: File | null
  avatarUrl: string | null
  bio: string
  selectedModes: MatchingMode[]
  shareLocation: boolean
  radiusKm: LocalRadius | null
  coordinates: { lat: number; lng: number } | null
  localArea: string | null
  localLabel: string | null
}

export const EMPTY_DRAFT: OnboardingDraft = {
  displayName: '',
  dob: '',
  countryCode: '',
  photo: null,
  avatarUrl: null,
  bio: '',
  selectedModes: [],
  shareLocation: false,
  radiusKm: null,
  coordinates: null,
  localArea: null,
  localLabel: null,
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function ageOnDate(dob: string, today = new Date()): number {
  if (!isValidDate(dob)) return -1
  const [y, m, d] = dob.split('-').map(Number)
  const birth = new Date(Date.UTC(y, m - 1, d))
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

export const MIN_AGE = 18

export function validateStep(step: number, draft: OnboardingDraft): string | null {
  switch (step) {
    case 1: {
      if (!draft.displayName.trim()) return 'Please enter your display name.'
      if (!draft.dob) return 'Please enter your date of birth.'
      if (!isValidDate(draft.dob)) return 'That date of birth doesn’t look right.'
      const age = ageOnDate(draft.dob)
      if (age < MIN_AGE) return 'You must be at least 18 to join Sensorium.'
      if (!draft.countryCode) return 'Please select your country.'
      return null
    }
    case 2: {
      if (draft.bio.length > 500) return 'Your bio can be at most 500 characters.'
      return null
    }
    case 3: {
      if (draft.selectedModes.length === 0) return 'Pick at least one matching mode.'
      return null
    }
    case 4: {
      if (!draft.selectedModes.includes('local')) return null
      if (!draft.shareLocation) return 'Share your location to join the Local mode.'
      if (!draft.coordinates || !draft.localArea) return 'We couldn’t determine your area yet.'
      if (!draft.radiusKm) return 'Choose a matching radius.'
      return null
    }
    default:
      return null
  }
}
