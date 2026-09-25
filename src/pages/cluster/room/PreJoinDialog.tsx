import { Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { Modal } from '../../../components/Modal'
import { cn } from '../../../lib/utils'

export interface PreJoinChoices {
  mic: boolean
  camera: boolean
}

/**
 * Pre-join choices before connecting: microphone on and camera off, matching
 * the mobile app's audio-first default. The browser asks for device
 * permission when LiveKit publishes after joining.
 */
export function PreJoinDialog({
  open,
  mic,
  camera,
  pending,
  onMicChange,
  onCameraChange,
  onJoin,
  onClose,
}: PreJoinChoices & {
  open: boolean
  pending: boolean
  onMicChange(value: boolean): void
  onCameraChange(value: boolean): void
  onJoin(): void
  onClose(): void
}) {
  const toggles = [
    {
      key: 'mic',
      label: 'Microphone',
      hint: 'Your voice in the call',
      on: mic,
      onChange: onMicChange,
      onIcon: <Mic className="h-5 w-5 text-on-primary" strokeWidth={2} aria-hidden />,
      offIcon: <MicOff className="h-5 w-5 text-on-surface" strokeWidth={2} aria-hidden />,
      pressedLabel: mic ? 'Turn microphone off' : 'Turn microphone on',
      testId: 'prejoin-mic-toggle',
    },
    {
      key: 'camera',
      label: 'Camera',
      hint: 'Your video in the call',
      on: camera,
      onChange: onCameraChange,
      onIcon: <Video className="h-5 w-5 text-on-primary" strokeWidth={2} aria-hidden />,
      offIcon: <VideoOff className="h-5 w-5 text-on-surface" strokeWidth={2} aria-hidden />,
      pressedLabel: camera ? 'Turn camera off' : 'Turn camera on',
      testId: 'prejoin-camera-toggle',
    },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Join the call">
      <div data-e2e="prejoin-dialog" className="mt-4 space-y-3">
        <p className="text-sm text-on-surface-variant">
          Calls use your microphone and, if you turn it on, your camera. Your camera starts off.
        </p>
        {toggles.map((toggle) => (
          <button
            key={toggle.key}
            type="button"
            aria-label={toggle.pressedLabel}
            aria-pressed={toggle.on}
            data-e2e={toggle.testId}
            onClick={() => toggle.onChange(!toggle.on)}
            disabled={pending}
            className={cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60',
              toggle.on
                ? 'border-primary bg-primary-container/15 hover:bg-primary-container/25'
                : 'border-outline-variant/70 bg-surface-container hover:bg-surface-high',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors',
                toggle.on ? 'bg-primary' : 'bg-surface-highest',
              )}
            >
              {toggle.on ? toggle.onIcon : toggle.offIcon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-on-surface">{toggle.label}</span>
              <span className="block text-xs text-on-surface-variant">{toggle.hint}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                'shrink-0 rounded-pill px-3 py-1 text-xs font-semibold transition-colors',
                toggle.on ? 'bg-primary text-on-primary' : 'bg-surface-highest text-on-surface-variant',
              )}
            >
              {toggle.on ? 'On' : 'Off'}
            </span>
          </button>
        ))}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-[44px] rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            data-e2e="prejoin-join"
            onClick={onJoin}
            disabled={pending}
            className="min-h-[48px] rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {pending ? 'Joining…' : 'Join call'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
