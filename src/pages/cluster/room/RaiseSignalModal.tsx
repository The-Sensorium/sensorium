import { Modal } from '../../../components/Modal'

const MAX_SIGNAL_PROMPT = 300

export function RaiseSignalModal({
  open,
  error,
  prompt,
  pending,
  onPromptChange,
  onClose,
  onRaise,
}: {
  open: boolean
  error: string | null
  prompt: string
  pending: boolean
  onPromptChange(value: string): void
  onClose(): void
  onRaise(): void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Raise a signal">
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          onRaise()
        }}
      >
        <label htmlFor="room-signal-prompt" className="sr-only">
          What do you need help with?
        </label>
        <textarea
          id="room-signal-prompt"
          rows={4}
          maxLength={MAX_SIGNAL_PROMPT}
          autoFocus
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="What do you need help with?"
          className="w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-sm leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-on-surface-variant">
            {prompt.length}/{MAX_SIGNAL_PROMPT}
          </span>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-error">{error}</span>}
            <button
              type="button"
              onClick={onClose}
              className="rounded-pill px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!prompt.trim() || pending}
              className="rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {pending ? 'Raising…' : 'Raise signal'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}