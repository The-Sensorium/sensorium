const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

export function DayDivider({ iso }: { iso: string }) {
  return (
    <p className="my-3 text-center text-xs font-semibold uppercase tracking-wide text-on-surface-variant/70">
      {dayFormatter.format(new Date(iso))}
    </p>
  )
}
