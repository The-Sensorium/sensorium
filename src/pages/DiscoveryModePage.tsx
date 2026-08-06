import { Link, useParams } from 'react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { isMatchingMode, modeInfo } from '../lib/modes'
import { useClustersByMode } from '../features/discovery'
import { useMyClusters } from '../features/matching'
import { ModePanel } from './discovery/ModePanel'
import { PublicClusterCard } from '../components/PublicClusterCard'

export function DiscoveryModePage() {
  const { modeId } = useParams<{ modeId: string }>()
  const raw = modeId ?? ''
  const mode = isMatchingMode(raw) ? raw : null
  const info = mode ? modeInfo(mode) : null

  const clusters = useClustersByMode(mode)
  const mine = useMyClusters()

  useDocumentTitle(info ? `${info.label} · Discovery` : 'Discovery')

  const myClusterIds = new Set((mine.data ?? []).map((m) => m.cluster.id))

  if (!mode || !info) {
    return (
      <div className="space-y-6">
        <header className="pt-2">
          <h1 className="font-display text-3xl font-semibold text-on-surface">Discovery</h1>
        </header>
        <p className="text-sm text-on-surface-variant">That matching mode doesn’t exist.</p>
        <Link
          to="/discovery"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to discovery
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <Link
          to="/discovery"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Discovery
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold text-on-surface">{info.label}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{info.detail}</p>
      </header>

      <ModePanel mode={mode} />

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-on-surface">Clusters</h2>
        {clusters.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : (clusters.data ?? []).length === 0 ? (
          <p className="text-sm text-on-surface-variant">No clusters in this mode yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(clusters.data ?? []).map((c) => (
              <PublicClusterCard key={c.id} cluster={c} isMember={myClusterIds.has(c.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}