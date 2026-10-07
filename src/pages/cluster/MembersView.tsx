import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { Cake, Clock, Loader2, Search, UserPlus, X } from 'lucide-react'
import { CLUSTER_SIZE } from '../../lib/constants'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import { useCluster } from '../../features/introductions'
import { useReplacementRound } from '../../features/votes'
import {
  isPendingCreated,
  useCancelCreatedInvitation,
  useCreatedPendingInvites,
  useEligibleComembers,
  useInviteToCreatedCluster,
} from '../../features/created-clusters'
import { Avatar } from '../../components/Avatar'
import { CountryFlag } from '../../components/CountryFlag'
import { IntroChecklistBanner } from '../../components/IntroChecklistBanner'
import { MemberCardMenu } from '../../components/MemberCardMenu'
import { MemberLocalTime } from '../../components/MemberLocalTime'
import { PronounBadge } from '../../components/PronounBadge'
import { ReportModal } from '../../components/ReportModal'
import { countryName } from '../../lib/countries'
import { inviteErrorMessage, toErrorMessage } from '../../lib/error'
import { isValidTimeZone } from '../../lib/timezones'

export function MembersView() {
  useDocumentTitle('Members')
  const { clusterId = '' } = useParams()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const members = useClusterMembers(clusterId)
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

  return (
    <section aria-label="Members" className="space-y-4">
      <IntroChecklistBanner key={clusterId} clusterId={clusterId} dismissible={false} />
      <CreatedPendingSection
        clusterId={clusterId}
        confirmedCount={list.length}
        confirmedIds={list.map((m) => m.id)}
      />
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
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {list.map((member) => {
            const hasLocalTime = !!member.timezone && isValidTimeZone(member.timezone)
            return (
              <li key={member.id} className="min-w-0">
                <div className="h-full rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift">
                  <div className="flex items-start gap-4">
                    <Link
                      to={`/profile/${member.id}?cluster=${clusterId}`}
                      className="flex min-w-0 flex-1 items-start gap-4"
                    >
                      <Avatar
                        name={member.display_name}
                        src={member.avatar_url}
                        className="h-14 w-14"
                      />
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

/** Pending roster, invite-more, and cancel controls for user-created clusters. */
function CreatedPendingSection({
  clusterId,
  confirmedCount,
  confirmedIds,
}: {
  clusterId: string
  confirmedCount: number
  confirmedIds: string[]
}) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const cluster = useCluster(clusterId)
  const isCreated = cluster.data?.origin === 'created'
  const pending = useCreatedPendingInvites(clusterId, isCreated === true)
  const eligible = useEligibleComembers(isCreated === true)
  const invite = useInviteToCreatedCluster(clusterId)
  const cancel = useCancelCreatedInvitation(clusterId)
  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const pendingList = useMemo(() => pending.data ?? [], [pending.data])
  const pendingIds = useMemo(() => new Set(pendingList.map((p) => p.user_id)), [pendingList])
  const confirmedIdSet = useMemo(() => new Set(confirmedIds), [confirmedIds])
  const q = search.trim().toLowerCase()
  const candidates = useMemo(
    () =>
      (eligible.data ?? []).filter(
        (p) =>
          !pendingIds.has(p.user_id) &&
          !confirmedIdSet.has(p.user_id) &&
          (!q || (p.display_name ?? '').toLowerCase().includes(q)),
      ),
    [eligible.data, pendingIds, confirmedIdSet, q],
  )

  if (cluster.data && cluster.data.origin !== 'created') return null
  if (cluster.isLoading || !cluster.data) return null

  const isCreator = cluster.data.created_by === userId
  const isPending = isPendingCreated(cluster.data, confirmedCount)
  const total = confirmedCount + pendingList.length
  const full = total >= 8

  return (
    <div className="space-y-3" data-e2e="created-pending-section">
      {actionError && (
        <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {actionError}
        </p>
      )}
      {isPending && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-on-surface">Pending</span>
            <span className="block text-on-surface-variant">
              {3 - confirmedCount} more {3 - confirmedCount === 1 ? 'member' : 'members'} needed
              to activate.
            </span>
          </span>
        </div>
      )}

      {pendingList.length > 0 && (
        <ul className="space-y-2" aria-label="Pending invitations">
          {pendingList.map((inv) => (
            <li
              key={inv.invitation_id}
              className="flex items-center gap-3 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container/40 p-3"
            >
              <Avatar name={inv.display_name} src={inv.avatar_url} className="h-10 w-10 opacity-80" />
              <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">
                {inv.display_name}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-on-surface-variant">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Pending
              </span>
              {isCreator && (
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => {
                    setActionError(null)
                    cancel.mutateAsync(inv.invitation_id).catch((err) => {
                      setActionError(toErrorMessage(err, 'Could not cancel the invitation.'))
                    })
                  }}
                  aria-label={`Cancel invitation to ${inv.display_name}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-high hover:text-on-surface disabled:opacity-60"
                >
                  <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isCreator && !full && (
        <div className="space-y-2">
          <button
            type="button"
            data-e2e="invite-more-toggle"
            onClick={() => setShowPicker((v) => !v)}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Invite more people
          </button>
          {showPicker && (
            <div className="space-y-2 rounded-2xl border border-outline-variant/60 bg-surface p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people…"
                  aria-label="Search people to invite"
                  className="w-full rounded-xl border border-outline-variant bg-surface-container py-2.5 pl-10 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>
              {eligible.isLoading ? (
                <p className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading…
                </p>
              ) : candidates.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No one else to invite right now.</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {candidates.slice(0, 20).map((person) => (
                    <li key={person.user_id}>
                      <button
                        type="button"
                        data-e2e={`invite-more-${person.user_id}`}
                        disabled={invite.isPending}
                        onClick={() => {
                          setActionError(null)
                          invite.mutateAsync(person.user_id).catch((err) => {
                            setActionError(inviteErrorMessage(err, 'Could not send the invitation.'))
                          })
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-container disabled:opacity-60"
                      >
                        <Avatar name={person.display_name} src={person.avatar_url} className="h-9 w-9" />
                        <span className="min-w-0 flex-1 truncate text-sm text-on-surface">
                          {person.display_name}
                        </span>
                        <span className="text-xs font-semibold text-primary">Invite</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
