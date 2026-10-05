import { profileStatusMeta, type ProfileStatus } from './profile-status'

// Presence dot color for an already-resolved-visible manual status. Online
// keeps the theme-specific emerald used across the app; the rest come from
// the shared status metadata so web and mobile never drift.
export function statusDotColor(manual: ProfileStatus, dark: boolean): string {
  if (manual === 'online') return dark ? '#34d399' : '#10b981'
  return profileStatusMeta(manual).dotHex
}
