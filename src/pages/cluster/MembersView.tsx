import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { Cake, Loader2, UserPlus } from 'lucide-react'
import { CLUSTER_SIZE } from '../../lib/constants'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import { useReplacementRound } from '../../features/votes'
import { isOnlineNow, usePresence } from '../../features/realtime'
import { Avatar } from '../../components/Avatar'
import { CountryFlag } from '../../components/CountryFlag'
import { IntroChecklistBanner } from '../../components/IntroChecklistBanner'
import { MemberCardMenu } from '../../components/MemberCardMenu'
import { MemberLocalTime } from '../../components/MemberLocalTime'
import { PronounBadge } from '../../components/PronounBadge'
import { ReportModal } from '../../components/ReportModal'
import { countryName } from '../../lib/countries'
import { isValidTimeZone } from '../../lib/timezones'

export function MembersView() {
  useDocumentTitle('Members')
  const { clusterId = '' } = useParams()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const members = useClusterMembers(clusterId)
  const { online } = usePresence(clusterId)
  const replacement = useReplacementRound(clusterId)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [reportFor, setReportFor] = useState<{ id: string; name: string } | null>(null)

  if (members.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading members…
      </div>
    )
  }

  const list = members.data ?? []
  const isOnline = (id: string) => isOnlineNow(online, id, userId)

  return (
    <section aria-label="Members" className="space-y-4">
      <IntroChecklistBanner key={clusterId} clusterId={clusterId} dismissible={false} />
      {replacement.data && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-3 py-2.5 text-xs"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-highest text-tertiary">
            <UserPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-on-surface">A spot just opened</span>
            <span className="block text-on-surface-variant">
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
            const hasLocalTime = !!member.timezone && isValidTimeZone(member.timezone)
            return (
              <li key={member.id}>
                <div className="h-full rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift">
                  <div className="flex items-start gap-4">
                    <Link
                      to={`/profile/${member.id}?cluster=${clusterId}`}
                      className="flex min-w-0 flex-1 items-start gap-4"
                    >
                      <div className="relative shrink-0">
<Avatar
                          name={member.display_name}
                          src={member.avatar_url}
                          className="h-14 w-14"
                        />
                        {onlineNow ? (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-emerald-500 dark:bg-emerald-400"
                            aria-hidden
                          />
                        ) : null}
                        <span className="sr-only">{onlineNow ? 'Online' : 'Offline'}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="min-w-0 truncate text-base font-semibold text-on-surface">
                            {member.display_name}
                          </span>
                          {member.pronouns && <PronounBadge pronouns={member.pronouns} />}
                        </div>
                        {(member.country_code || member.birth_year || hasLocalTime) && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                            {member.country_code && (
                              <CountryFlag
                                code={member.country_code}
                                label={countryName(member.country_code)}
                              />
                            )}
                            {member.country_code && (member.birth_year || hasLocalTime) && (
                              <span className="h-3 w-px bg-outline-variant/60" aria-hidden />
                            )}
                            {member.birth_year && (
                              <span className="inline-flex items-center gap-1">
                                <Cake className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden />
                                {member.birth_year}
                              </span>
                            )}
                            {member.birth_year && hasLocalTime && (
                              <span className="h-3 w-px bg-outline-variant/60" aria-hidden />
                            )}
                            {hasLocalTime ? (
                              <MemberLocalTime timeZone={member.timezone} />
                            ) : null}
                          </p>
                        )}
                        {member.current_status ? (
                          <span className="mt-1.5 block truncate text-xs text-on-surface-variant">
                            “{member.current_status}”
                          </span>
                        ) : null}
                      </div>
                    </Link>
                    <MemberCardMenu
                      member={member}
                      clusterId={clusterId}
                      isSelf={member.id === userId}
                      open={openMenuId === member.id}
                      onOpen={() => setOpenMenuId(member.id)}
                      onClose={() => setOpenMenuId(null)}
                      onReport={() => {
                        setOpenMenuId(null)
                        setReportFor({ id: member.id, name: member.display_name })
                      }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {reportFor ? (
        <ReportModal
          open
          onClose={() => setReportFor(null)}
          clusterId={clusterId}
          target={reportFor}
        />
      ) : null}
    </section>
  )
}
