import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { Cake, Loader2, MapPin, UserPlus } from 'lucide-react'
import { CLUSTER_SIZE } from '../../lib/constants'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import { useReplacementRound } from '../../features/votes'
import { usePresence } from '../../features/realtime'
import { Avatar } from '../../components/Avatar'
import { AvailabilityBadge } from '../../components/AvailabilityBadge'
import { PronounBadge } from '../../components/PronounBadge'
import { countryName } from '../../lib/countries'

export function MembersView() {
  useDocumentTitle('Members')
  const { clusterId = '' } = useParams()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const members = useClusterMembers(clusterId)
  const { online } = usePresence(clusterId)
  const replacement = useReplacementRound(clusterId)

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
      {replacement.data && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-tertiary/20 bg-tertiary-container/10 px-3 py-2.5 text-xs text-tertiary"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tertiary-container/25">
            <UserPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">A spot just opened</span>
            <span className="block text-tertiary/70">
              We're {list.length} of {CLUSTER_SIZE}, finding a new member.
            </span>
          </span>
        </div>
      )}
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
                        {member.pronouns && (
                          <div className="mt-1">
                            <PronounBadge pronouns={member.pronouns} />
                          </div>
                        )}
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 truncate text-xs text-on-surface-variant">
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
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
