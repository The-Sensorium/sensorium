import type { SignalStatus } from '../features/signals'

/** Single source for signal status labels and their theme color key. Shared by
 * the signals list, the signal detail screen, and the room timeline row. */
export const SIGNAL_STATUS_META: Record<
  SignalStatus,
  { label: string; colorKey: 'primary' | 'tertiary' | 'onSurfaceVariant' }
> = {
  open: { label: 'Open', colorKey: 'primary' },
  in_progress: { label: 'In progress', colorKey: 'tertiary' },
  resolved: { label: 'Resolved', colorKey: 'onSurfaceVariant' },
}
