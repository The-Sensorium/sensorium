export function PronounBadge({ pronouns }: { pronouns: string }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
      {pronouns}
    </span>
  )
}
