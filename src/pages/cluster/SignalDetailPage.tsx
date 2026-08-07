import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { ArrowLeft, Loader2, MessageSquare } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useClusterMembers } from '../../features/matching'
import {
  useClusterSignals,
  useSignalReplies,
  useReplySignal,
  useSetSignalStatus,
  SIGNAL_STATUS_ORDER,
} from '../../features/signals'
import type { SignalStatus } from '../../features/signals'
import { useAuth } from '../../app/auth-context'
import { Avatar } from '../../components/Avatar'

const statusMeta: Record<SignalStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-primary/10 text-primary' },
  in_progress: { label: 'In progress', className: 'bg-tertiary-container/25 text-tertiary' },
  resolved: { label: 'Resolved', className: 'bg-surface-container text-on-surface-variant' },
}

const timeAgo = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function SignalDetailPage() {
  useDocumentTitle('Signal')
  const { clusterId = '', signalId = '' } = useParams()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const navigate = useNavigate()
  const { key } = useLocation()

  const signals = useClusterSignals(clusterId)
  const replies = useSignalReplies(clusterId, signalId)
  const members = useClusterMembers(clusterId)
  const reply = useReplySignal(clusterId, signalId)
  const setStatus = useSetSignalStatus(clusterId)

  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const memberById = new Map((members.data ?? []).map((m) => [m.id, m]))
  const s = (signals.data ?? []).find((x) => x.id === signalId)
  const isRaiser = !!s && s.author_id === userId
  const raiser = s ? memberById.get(s.author_id) : undefined

  async function handleReply() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setError(null)
    setStatusError(null)
    try {
      await reply.mutateAsync(trimmed)
      setDraft('')
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  async function handleStatus(next: SignalStatus) {
    if (!s) return
    setStatusError(null)
    setError(null)
    try {
      await setStatus.mutateAsync({ signalId: s.id, status: next })
    } catch {
      setStatusError('Something went wrong updating the status.')
    }
  }

  if (signals.isLoading || replies.isLoading || members.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading signal…
      </div>
    )
  }

  if (!s) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
        This signal isn’t available.
      </div>
    )
  }

  const nextStatus =
    SIGNAL_STATUS_ORDER[SIGNAL_STATUS_ORDER.indexOf(s.status) + 1] ?? null
  const meta = statusMeta[s.status]

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        type="button"
        onClick={() => (key === 'default' ? navigate(`/cluster/${clusterId}/signals`) : navigate(-1))}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Back
      </button>

      <article className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Avatar
            name={raiser?.display_name ?? 'Member'}
            src={raiser?.avatar_url}
            className="h-6 w-6"
            textClassName="text-xs"
          />
          <span className="text-sm font-semibold text-on-surface">
            {raiser?.display_name ?? 'Member'}
          </span>
          {isRaiser && <span className="text-xs text-on-surface-variant">(you)</span>}
          <span className="text-xs text-on-surface-variant">· {timeAgo.format(new Date(s.created_at))}</span>
          <span className={cn('ml-auto rounded-pill px-2.5 py-1 text-xs font-medium', meta.className)}>
            {meta.label}
          </span>
        </div>
        <h1 className="mt-3 font-display text-xl font-semibold text-on-surface">{s.prompt}</h1>
        {s.resolved_at && (
          <p className="mt-2 text-xs text-on-surface-variant">
            Resolved {timeAgo.format(new Date(s.resolved_at))}
            {s.resolved_by ? ` by ${memberById.get(s.resolved_by)?.display_name ?? 'a member'}` : ''}
          </p>
        )}

        {isRaiser && nextStatus && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-outline-variant/60 pt-4">
            <button
              type="button"
              onClick={() => void handleStatus(nextStatus)}
              disabled={setStatus.isPending}
              className="rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {nextStatus === 'in_progress' ? 'Mark in progress' : 'Mark resolved'}
            </button>
            {statusError && (
              <p role="alert" className="text-xs text-error">
                {statusError}
              </p>
            )}
          </div>
        )}
      </article>

      <section aria-label="Replies">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-on-surface">
          <MessageSquare className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {replies.data?.length ?? 0} {replies.data?.length === 1 ? 'reply' : 'replies'}
        </h2>

        {(replies.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            No replies yet. Offer a hand below.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(replies.data ?? []).map((r) => (
              <li key={r.id} className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft">
                <div className="flex items-center gap-2">
                  <Avatar
                    name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                    src={memberById.get(r.author_id)?.avatar_url}
                    className="h-5 w-5"
                    textClassName="text-[10px]"
                  />
                  <span className="text-sm font-semibold text-on-surface">
                    {memberById.get(r.author_id)?.display_name ?? 'Member'}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    · {timeAgo.format(new Date(r.created_at))}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-on-surface">{r.content}</p>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-4 rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault()
            void handleReply()
          }}
        >
          <label htmlFor="signal-reply" className="sr-only">
            Reply to this signal
          </label>
          <textarea
            id="signal-reply"
            rows={3}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Offer a hand or share a thought…"
            className="w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-sm leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-on-surface-variant">{draft.length}/2000</span>
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-error">{error}</span>}
              <button
                type="submit"
                disabled={!draft.trim() || reply.isPending}
                className="rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
              >
                {reply.isPending ? 'Sending…' : 'Reply'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
