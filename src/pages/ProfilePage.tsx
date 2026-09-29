import { useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import {
  ArrowLeft,
  Briefcase,
  Cake,
  Flag,
  Heart,
  Loader2,
  MessageSquare,
  Sparkles,
  Target,
  Telescope,
  Users,
} from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useClusterMembers, useMyClusters } from '../features/matching'
import { isOnlineNow, usePresence } from '../features/realtime'
import { useMemberIntroAnswers, useIntroQuestionMap } from '../features/cluster'
import {
  usePostCountsForClusters,
  usePostImageUrl,
  useUserPosts,
} from '../features/posts'
import { useAuth } from '../app/auth-context'
import { Avatar } from '../components/Avatar'
import { AvatarViewer } from '../components/AvatarViewer'
import { AvailabilityBadge } from '../components/AvailabilityBadge'
import { CountryFlag } from '../components/CountryFlag'
import { MemberLocalTime } from '../components/MemberLocalTime'
import { PronounBadge } from '../components/PronounBadge'
import { LinkifiedText } from '../components/LinkifiedText'
import { ReportModal } from '../components/ReportModal'
import { MuteButton } from '../components/MuteButton'
import { countryName } from '../lib/countries'
import { isValidTimeZone } from '../lib/timezones'
import { cn } from '../lib/utils'

const INTRO_ICONS = [Briefcase, Heart, Target, Users, Telescope]

const postTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function PostThumb({
  imageUrl,
  gifUrl,
  alt,
}: {
  imageUrl?: string | null
  gifUrl?: string | null
  alt?: string
}) {
  const { data: signedUrl } = usePostImageUrl(imageUrl ?? null)
  const src = gifUrl ?? signedUrl ?? null
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt ?? 'Post media'}
      loading="lazy"
      className="h-24 w-24 shrink-0 rounded-xl border border-outline-variant/60 object-cover"
    />
  )
}

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
  const onlineNow = isOnlineNow(online, userId, auth.state === 'signedIn' ? auth.userId : null)
  const [reportOpen, setReportOpen] = useState(false)
  const userPosts = useUserPosts(userId)
  const postClusterIds = useMemo(
    () => [...new Set((userPosts.data ?? []).map((p) => p.cluster_id))],
    [userPosts.data],
  )
  const counts = usePostCountsForClusters(postClusterIds)

  const likesByPost = useMemo(() => {
    const byPost = new Map<string, number>()
    for (const c of counts.data ?? []) byPost.set(c.post_id, c.likes_count)
    return byPost
  }, [counts.data])
  const commentsByPost = useMemo(() => {
    const byPost = new Map<string, number>()
    for (const c of counts.data ?? []) byPost.set(c.post_id, c.comments_count)
    return byPost
  }, [counts.data])

  const member = (members.data ?? []).find((m) => m.id === userId)
  const cluster = (myClusters.data ?? []).find((c) => c.cluster.id === clusterId)
  const hasLocalTime = !!member?.timezone && isValidTimeZone(member.timezone)

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
    <div className="mx-auto max-w-xl space-y-3 md:space-y-4">
      <Link
        to={`/cluster/${clusterId}/members`}
        className="inline-flex min-h-[44px] items-center gap-2 py-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Back to members
      </Link>

      {/* ── Profile Header ─────────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft md:p-5">
        <div className="flex flex-col items-center text-center">
          <AvatarViewer
            name={member.display_name}
            src={member.avatar_url}
            className="h-32 w-32 md:h-36 md:w-36"
          />
          {member.pronouns && (
            <div className="mt-3">
              <PronounBadge pronouns={member.pronouns} />
            </div>
          )}
          <h1 className="mt-1.5 w-full truncate text-center font-display text-xl font-semibold text-on-surface">
            {member.display_name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm text-on-surface-variant">
            {member.country_code && (
              <span className="inline-flex items-center gap-1">
                <CountryFlag code={member.country_code} />
                {countryName(member.country_code)}
              </span>
            )}
            {member.country_code && hasLocalTime && (
              <span className="h-4 w-px bg-outline-variant/60" aria-hidden />
            )}
            {hasLocalTime ? (
              <span>
                <span className="sr-only">Local time: </span>
                <MemberLocalTime timeZone={member.timezone} />
              </span>
            ) : null}
            {(member.country_code || hasLocalTime) && (
              <span className="h-4 w-px bg-outline-variant/60" aria-hidden />
            )}
            {onlineNow ? (
              <AvailabilityBadge value={member.availability} />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                <span className="h-2 w-2 rounded-full bg-on-surface-variant/30" aria-hidden />
                Offline
              </span>
            )}
          </p>
        </div>

        {member.current_status && (
          <div className="mt-3 border-t border-outline-variant/40 pt-3 text-left">
            <p className="text-sm italic text-on-surface-variant">
              <LinkifiedText text={member.current_status} />
            </p>
          </div>
        )}

        {!isSelf ? (
          <div>
            <Link
              to={`/cluster/${clusterId}`}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Message {member.display_name}
            </Link>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <MuteButton targetUserId={member.id} targetName={member.display_name} fullWidth />
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-pill border border-outline-variant/60 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <Flag className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Report
              </button>
            </div>
          </div>
        ) : (
          <Link
            to="/settings/profile"
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Edit profile
          </Link>
        )}
      </div>

      {(member.birth_year || cluster) && (
        <section
          aria-label="Details"
          className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft md:p-5"
        >
          <div className={cn('grid', member.birth_year && cluster ? 'grid-cols-2' : 'grid-cols-1')}>
            {member.birth_year ? (
              <div className="flex items-center gap-3">
                <Cake
                  className="h-5 w-5 shrink-0 text-on-surface-variant"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Born
                  </p>
                  <p className="mt-0.5 text-sm text-on-surface-variant">{member.birth_year}</p>
                </div>
              </div>
            ) : null}
            {cluster ? (
              <div
                className={cn(
                  'flex items-center gap-3',
                  member.birth_year ? 'border-l border-outline-variant/40 pl-4' : '',
                )}
              >
                <Users
                  className="h-5 w-5 shrink-0 text-on-surface-variant"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Cluster
                  </p>
                  <p
                    title={cluster.cluster.name}
                    className="mt-0.5 truncate text-sm text-on-surface-variant"
                  >
                    {cluster.cluster.name}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {member.bio && (
        <section
          aria-label="About"
          className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">About</h2>
          <div className="mt-1 flex gap-3">
            <span aria-hidden className="text-5xl leading-none text-on-surface-variant/60">
              “
            </span>
            <p className="flex-1 py-4 text-sm leading-5 text-on-surface">
              <LinkifiedText text={member.bio} />
            </p>
            <span
              aria-hidden
              className="self-end text-5xl leading-none text-on-surface-variant/60"
            >
              ”
            </span>
          </div>
        </section>
      )}

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
          <div className="mt-2">
            <p className="text-sm text-on-surface-variant">
              {isSelf
                ? 'You have not completed your introductions yet.'
                : `${member.display_name} hasn't completed their introductions.`}
            </p>
            {isSelf && (
              <Link
                to={`/cluster/${clusterId}/introductions`}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
              >
                Complete your introductions
              </Link>
            )}
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-outline-variant/40">
            {answers.map((a) => {
              const Icon = INTRO_ICONS[a.question_id - 1] ?? Sparkles
              const prompt = questions.data?.get(a.question_id) ?? `Question ${a.question_id}`
              return (
                <li key={a.question_id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary">{prompt}</p>
                    <p className="mt-0.5 text-sm leading-5 text-on-surface-variant"><LinkifiedText text={a.answer} /></p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Posts ──────────────────────────────────────────── */}
      {!userPosts.isLoading && (userPosts.data ?? []).length > 0 && (
        <section aria-label="Posts">
          <h2 className="font-display text-lg font-semibold text-on-surface">Posts</h2>
          <ul className="mt-3 space-y-3">
            {(userPosts.data ?? []).map((post) => (
              <li key={post.id}>
                <Link
                  to={`/posts/${post.id}`}
                  className="flex w-full items-start gap-3 rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft transition-colors hover:border-outline-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Avatar
                        name={member.display_name}
                        src={member.avatar_url}
                        className="h-5 w-5"
                        textClassName="text-[11px]"
                      />
                      <span className="text-xs text-on-surface-variant">
                        · {postTime.format(new Date(post.created_at))}
                      </span>
                    </div>
                    {post.title && (
                      <h3 className="mt-1.5 font-display text-sm font-semibold text-on-surface">
                        {post.title}
                      </h3>
                    )}
                    {post.content && (
                      <p className="mt-1 line-clamp-3 overflow-hidden whitespace-pre-wrap text-sm leading-5 text-on-surface">
                        {post.content}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-sm text-on-surface-variant">
                      <span className="inline-flex items-center gap-1.5">
                        <Heart className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                        {likesByPost.get(post.id) ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                        {commentsByPost.get(post.id) ?? 0}
                      </span>
                    </div>
                  </div>
                  <PostThumb imageUrl={post.image_url} gifUrl={post.gif_url} alt={post.content ?? 'Post media'} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
