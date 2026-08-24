import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import {
  ArrowLeft,
  Briefcase,
  Cake,
  CalendarDays,
  Flag,
  Heart,
  Loader2,
  MapPin,
  Sparkles,
  Target,
  Telescope,
  Users,
} from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useClusterMembers, useMyClusters } from '../features/matching'
import { usePresence } from '../features/realtime'
import { useMemberIntroAnswers, useIntroQuestionMap } from '../features/cluster'
import { useUserPosts } from '../features/posts'
import { useAuth } from '../app/auth-context'
import { Avatar } from '../components/Avatar'
import { AvailabilityBadge } from '../components/AvailabilityBadge'
import { PronounBadge } from '../components/PronounBadge'
import { PostMedia } from '../components/PostMedia'
import { ReportModal } from '../components/ReportModal'
import { countryName } from '../lib/countries'
import { cn } from '../lib/utils'

const INTRO_ICONS = [Briefcase, Heart, Target, Users, Telescope]

const postTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

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
  const myClusters = useMyClusters()
  const auth = useAuth()
  const isSelf = auth.state === 'signedIn' && auth.userId === userId
  const { online } = usePresence(clusterId)
  const onlineNow = online.has(userId) || isSelf
  const [reportOpen, setReportOpen] = useState(false)
  const userPosts = useUserPosts(userId)

  const member = (members.data ?? []).find((m) => m.id === userId)
  const cluster = (myClusters.data ?? []).find((c) => c.cluster.id === clusterId)

  if (members.isLoading || myClusters.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
        This member isn't in your cluster.
      </div>
    )
  }

  const answers = introAnswers.data ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-3 md:space-y-4">
      <Link
        to={`/cluster/${clusterId}/members`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Back to members
      </Link>

      {/* ── Profile Header ─────────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:gap-5">
          {/* Left: profile info */}
          <div className="flex flex-1 items-start gap-3 md:gap-4">
            <Avatar
              name={member.display_name}
              src={member.avatar_url}
              className="h-20 w-20 md:h-[88px] md:w-[88px]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h1 className="truncate font-display text-xl font-semibold text-on-surface">
                  {member.display_name}
                </h1>
                {member.pronouns && <PronounBadge pronouns={member.pronouns} />}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-on-surface-variant">
                {member.country_code && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                    {countryName(member.country_code)}
                  </span>
                )}
                {member.country_code && member.birth_year && (
                  <span className="text-outline-variant" aria-hidden>
                    ·
                  </span>
                )}
                {member.birth_year && (
                  <span className="inline-flex items-center gap-1">
                    <Cake className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                    Born {member.birth_year}
                  </span>
                )}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {onlineNow ? (
                  <AvailabilityBadge value={member.availability} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                    <span className="h-2 w-2 rounded-full bg-on-surface-variant/30" aria-hidden />
                    Offline
                  </span>
                )}
                {member.current_status && (
                  <span className="text-xs italic text-on-surface-variant">
                    "{member.current_status}"
                  </span>
                )}
              </div>
              {member.bio && (
                <p className="mt-1.5 text-sm leading-5 text-on-surface-variant">{member.bio}</p>
              )}
            </div>
          </div>

          {/* Right: cluster context */}
          {cluster && (
            <div className="shrink-0 border-t border-outline-variant/40 pt-3 md:w-52 md:border-t-0 md:border-l md:pt-0 md:pl-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">
                Your cluster
              </h2>
              <p className="mt-1.5 text-sm font-medium text-on-surface">
                {cluster.cluster.name}
              </p>
              <p className="mt-1 flex items-center gap-3 text-xs text-on-surface-variant">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {cluster.memberCount} / 8 members
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {new Date(cluster.joinedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </p>
            </div>
          )}
        </div>

        {!isSelf && (
          <div className="mt-3 flex items-center gap-2 border-t border-outline-variant/40 pt-3 md:mt-4 md:pt-4">
            <Link
              to={`/cluster/${clusterId}`}
              className={cn(
                'inline-flex items-center gap-2 rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container',
              )}
            >
              Message {member.display_name}
            </Link>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-pill border border-outline-variant px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              <Flag className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Report
            </button>
          </div>
        )}
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        clusterId={clusterId}
        target={{ id: member.id, name: member.display_name }}
      />

      {/* ── Introductions ──────────────────────────────────── */}
      <section
        aria-label="Introductions"
        className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft"
      >
        <h2 className="font-display text-lg font-semibold text-on-surface">Introductions</h2>
        {introAnswers.isLoading ? (
          <p className="mt-2 text-sm text-on-surface-variant">Loading…</p>
        ) : answers.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            {member.display_name} hasn't completed their introductions.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-outline-variant/40">
            {answers.map((a) => {
              const Icon = INTRO_ICONS[a.question_id - 1] ?? Sparkles
              const prompt = questions.data?.get(a.question_id) ?? `Question ${a.question_id}`
              return (
                <li key={a.question_id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary">{prompt}</p>
                    <p className="mt-0.5 text-sm leading-5 text-on-surface-variant">{a.answer}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Posts ──────────────────────────────────────────── */}
      {!userPosts.isLoading && (userPosts.data ?? []).length > 0 && (
        <section
          aria-label="Posts"
          className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft"
        >
          <h2 className="font-display text-lg font-semibold text-on-surface">Posts</h2>
          <ul className="mt-3 space-y-4">
            {(userPosts.data ?? []).map((post) => (
              <li key={post.id}>
                <Link
                  to={`/posts/${post.id}`}
                  className="block rounded-xl transition-colors hover:bg-surface-container/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Avatar
                      name={member.display_name}
                      src={member.avatar_url}
                      className="h-5 w-5"
                      textClassName="text-[10px]"
                    />
                    <span className="text-sm font-medium text-on-surface">{member.display_name}</span>
                    <span className="text-xs text-on-surface-variant">
                      · {postTime.format(new Date(post.created_at))}
                    </span>
                  </div>
                  {post.title && (
                    <p className="mt-1.5 font-display text-sm font-semibold text-on-surface">{post.title}</p>
                  )}
                  {post.content && (
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-on-surface">
                      {post.content}
                    </p>
                  )}
                  <PostMedia imageUrl={post.image_url} gifUrl={post.gif_url} alt={post.content ?? 'Post media'} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
