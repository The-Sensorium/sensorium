export function MutedPlaceholder({ name, onToggle }: { name: string; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container/40 px-4 py-2.5 text-sm text-on-surface-variant">
      <span>
        Muted content from {name}. Only you can see this notice.
      </span>{' '}
      <button
        type="button"
        onClick={onToggle}
        className="font-semibold text-primary hover:underline"
      >
        Show
      </button>
    </div>
  )
}
