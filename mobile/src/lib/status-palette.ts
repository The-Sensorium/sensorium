/** Off-token accent pairs for time-of-day, availability, period, and status
 * cues. Centralized so the light/dark values cannot drift between files:
 * amber-700/400, emerald-700/300, and sky-700/300. */
export const STATUS_PALETTE = {
  amber: { light: '#b45309', dark: '#fbbf24' },
  green: { light: '#047857', dark: '#6ee7b7' },
  sky: { light: '#0369a1', dark: '#7dd3fc' },
} as const
