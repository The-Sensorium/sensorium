import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Cake, Flag, Loader2, MapPin } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useClusterMembers } from '../features/matching'
import { useMemberIntroAnswers, useIntroQuestionMap } from '../features/cluster'
import { useAuth } from '../app/auth-context'
import { Avatar } from '../components/Avatar'
import { AvailabilityBadge } from '../components/AvailabilityBadge'
import { ReportModal } from '../components/ReportModal'
import { countryName } from '../lib/countries'

export function ProfilePage() {
  useDocumentTitle('Profile')
  const { userId = '' } = useParams()
  const [params] = useSearchParams()
  const clusterId = params.get('cluster')

  if (!clusterId) {
    return <Navigate to={userId === 'me' ? '/settings' : '/home'} replace />
  }

  return <MemberProfile clusterId={clusterId} userId={userId} />
}

function MemberProfile({ clusterId, userId }: { clusterId: string; userId: string }) {
  const members = useClusterMembers(clusterId)
  const introAnswers = useMemberIntroAnswers(clusterId, userId)
  const questions = useIntroQuestionMap()
  const auth = useAuth()
  const isSelf = auth.state === 'signedIn' && auth.userId === userId
  const [reportOpen, setReportOpen] = useState(false)

  const member = (members.data ?? []).find((m) => m.id === userId)

  if (members.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
        This member isn’t in your cluster.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        to={`/cluster/${clusterId}/members`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Back to members
      </Link>

      <header className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
        <div className="flex items-start gap-4">
          <Avatar name={member.display_name} src={member.avatar_url} className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-semibold text-on-surface">
              {member.display_name}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface-variant">
              {member.country_code && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {countryName(member.country_code)}
                </span>
              )}
              {member.birth_year && (
                <span className="inline-flex items-center gap-1.5">
                  <Cake className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {member.birth_year}
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AvailabilityBadge value={member.availability} />
              {member.current_status && (
                <span className="text-xs text-on-surface-variant">“{member.current_status}”</span>
              )}
            </div>
          </div>
          {!isSelf && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              aria-label={`Report ${member.display_name}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:border-error/50 hover:text-error"
            >
              <Flag className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Report
            </button>
          )}
        </div>
        {member.bio && <p className="mt-4 text-sm leading-6 text-on-surface-variant">{member.bio}</p>}
      </header>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        clusterId={clusterId}
        target={{ id: member.id, name: member.display_name }}
      />

      <section aria-label="Introductions" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <h2 className="font-display text-lg font-semibold text-on-surface">Introductions</h2>
        {introAnswers.isLoading ? (
          <p className="mt-2 text-sm text-on-surface-variant">Loading…</p>
        ) : (introAnswers.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            {member.display_name} hasn’t completed their introductions.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(introAnswers.data ?? []).map((a) => (
              <li key={a.question_id}>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {questions.data?.get(a.question_id) ?? `Question ${a.question_id}`}
                </p>
                <p className="mt-1 text-sm leading-6 text-on-surface-variant">{a.answer}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
