export type MutedKind = 'message' | 'post' | 'comment' | 'signal'

export function MutedPlaceholder({
  name,
  onToggle,
  kind = 'message',
}: {
  name: string
  onToggle: () => void
  kind?: MutedKind
}) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container/40 px-4 py-2.5 text-sm text-on-surface-variant">
      <span>
        {kind === 'post'
          ? `Muted post from ${name}.`
          : kind === 'comment'
            ? `Muted comment from ${name}.`
            : kind === 'signal'
              ? `Muted signal from ${name}.`
              : `Muted content from ${name}.`}{' '}
        Only you can see this notice.
      </span>{' '}
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Show muted ${kind}`}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-4 py-2.5 font-semibold text-primary hover:underline sm:min-h-[32px] sm:min-w-0 sm:px-2 sm:py-1"
      >
        Show
      </button>
    </div>
  )
}

export function MutedHideBar({
  name,
  onToggle,
  kind = 'message',
}: {
  name: string
  onToggle: () => void
  kind?: MutedKind
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container/40 px-4 py-2.5 text-sm text-on-surface-variant">
      <span className="flex-1">
        Showing muted {kind} from {name}.
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Hide muted ${kind}`}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-4 py-2.5 font-semibold text-primary hover:underline sm:min-h-[32px] sm:min-w-0 sm:px-2 sm:py-1"
      >
        Hide
      </button>
    </div>
  )
}
