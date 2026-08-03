import { Link } from 'react-router'
import { ArrowRight, Compass, Loader2, Users } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useMyClusters } from '../features/matching'
import { ClusterCard } from '../components/ClusterCard'

export function ClustersPage() {
  useDocumentTitle('Clusters')
  const clusters = useMyClusters()

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Clusters</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Every cluster you’ve been matched into.</p>
        </div>
        <Link
          to="/discovery"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
        >
          Find a match <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </Link>
      </header>

      {clusters.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : (clusters.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <Users className="mx-auto h-6 w-6 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">
            No clusters yet. Join a queue and you’ll be matched with 7 strangers.
          </p>
          <Link
            to="/discovery"
            className="mt-5 inline-flex items-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            <Compass className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Browse matching modes
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(clusters.data ?? []).map((item) => (
            <ClusterCard key={item.cluster.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
