import { useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { Loader2 } from 'lucide-react'
import { useClusterMembers } from '../../features/matching'
import { useClusterMoods } from '../../features/cluster'
import { MOODS, moodMeta, type Mood } from '../../lib/moods'

const timeAgo = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function PulseView() {
  useDocumentTitle('Pulse')
  const { clusterId = '' } = useParams()
  const members = useClusterMembers(clusterId)
  const moods = useClusterMoods(clusterId)

  const latestByUser = new Map<string, Mood>()
  const recent = [...(moods.data ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 12)

  for (const m of moods.data ?? []) {
    if (!latestByUser.has(m.user_id)) latestByUser.set(m.user_id, m.mood)
  }

  const nameById = new Map((members.data ?? []).map((m) => [m.id, m.display_name]))

  const counts = new Map<Mood, number>()
  for (const mood of latestByUser.values()) counts.set(mood, (counts.get(mood) ?? 0) + 1)
  const total = latestByUser.size

  if (moods.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading pulse…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section aria-label="Pulse" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <h2 className="font-display text-lg font-semibold text-on-surface">Cluster pulse</h2>
        <p className="text-xs text-on-surface-variant">
          Latest mood of {total} member{total === 1 ? '' : 's'}
        </p>

        <div className="mt-4 space-y-3">
          {MOODS.map((m) => {
            const count = counts.get(m.value) ?? 0
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={m.value}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-on-surface">
                    <span aria-hidden>{m.emoji}</span> {m.label}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {count} · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-container">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          {total === 0 && (
            <p className="text-sm text-on-surface-variant">
              No one has shared a mood yet. Tap a mood in the header to start.
            </p>
          )}
        </div>
      </section>

      <section aria-label="Recent mood updates" className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-on-surface">Recent updates</h2>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
            Mood updates will appear here.
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/60 rounded-2xl border border-outline-variant/60 bg-surface shadow-soft">
            {recent.map((m) => {
              const meta = moodMeta(m.mood)
              return (
                <li key={`${m.user_id}-${m.created_at}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xl" aria-hidden>
                    {meta.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-on-surface">
                    {nameById.get(m.user_id) ?? 'Member'}
                  </span>
                  <span className="shrink-0 text-xs text-on-surface-variant">
                    {timeAgo.format(new Date(m.created_at))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
