import { Navigate, useParams } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useCluster, useMyMembership } from '../features/introductions'

/**
 * Compatibility route only: clusters open at formation, so there is no waiting
 * state. Any member landing here (old links, bookmarks) goes to the room.
 */
export function WaitingForOthersPage() {
  useDocumentTitle('Waiting for Others')
  const { clusterId = '' } = useParams()
  const cluster = useCluster(clusterId)
  const membership = useMyMembership(clusterId)

  if (cluster.isLoading || membership.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!cluster.data) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
        This cluster isn’t available to you.
      </div>
    )
  }

  return <Navigate to={`/cluster/${clusterId}`} replace />
}
