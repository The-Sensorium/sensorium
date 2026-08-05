import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { Cake, Flag, Loader2, MapPin } from 'lucide-react'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import { usePresence } from '../../features/realtime'
import { Avatar } from '../../components/Avatar'
import { AvailabilityBadge } from '../../components/AvailabilityBadge'
import { ReportModal } from '../../components/ReportModal'
import { countryName } from '../../lib/countries'

export function MembersView() {
  useDocumentTitle('Members')
  const { clusterId = '' } = useParams()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const members = useClusterMembers(clusterId)
  const { online } = usePresence(clusterId)
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)

  if (members.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading members…
      </div>
    )
  }

  const list = members.data ?? []
  const isOnline = (id: string) => online.has(id) || id === userId

  return (
    <section aria-label="Members" className="space-y-4">
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
          No members yet.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((member) => {
            const onlineNow = isOnline(member.id)
            return (
              <li key={member.id}>
                <div className="h-full rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift">
                  <Link
                    to={`/profile/${member.id}?cluster=${clusterId}`}
                    className="block"
                  >
                    <div className="flex items-center gap-3">
                      <div className="shrink-0">
                        <Avatar
                          name={member.display_name}
                          src={member.avatar_url}
                          className="h-11 w-11"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          {member.display_name}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 truncate text-xs text-on-surface-variant">
                          {member.country_code && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden />
                              {countryName(member.country_code)}
                            </span>
                          )}
                          {member.birth_year && (
                            <span className="inline-flex items-center gap-1">
                              <Cake className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden />
                              {member.birth_year}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </Link>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {onlineNow ? (
                        <AvailabilityBadge value={member.availability} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                          <span className="h-2 w-2 rounded-full bg-on-surface-variant/30" aria-hidden />
                          Offline
                        </span>
                      )}
                      {member.current_status ? (
                        <span className="truncate text-xs text-on-surface-variant">
                          “{member.current_status}”
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`Report ${member.display_name}`}
                      onClick={() =>
                        setReportTarget({ id: member.id, name: member.display_name })
                      }
                      className="inline-flex items-center gap-1.5 rounded-pill border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:border-error/50 hover:text-error"
                    >
                      <Flag className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                      Report
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ReportModal
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        clusterId={clusterId}
        target={reportTarget ?? { id: '', name: '' }}
      />
    </section>
  )
}
