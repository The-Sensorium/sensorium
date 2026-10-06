import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { ChevronDown, Loader2, MessageSquare, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useClusterMembers } from '../../features/matching'
import { useClusterSignals, useSignalReplyCounts, useRaiseSignal } from '../../features/signals'
import type { Signal, SignalStatus } from '../../features/signals'
import { useAuth } from '../../app/auth-context'
import { Avatar } from '../../components/Avatar'
import { Modal } from '../../components/Modal'
import { MutedHideBar, MutedPlaceholder } from '../../components/MutedPlaceholder'
import { isMutedAuthor, mutedIds, toggleRevealedId, useMyMutes } from '../../features/moderation'

const statusMeta: Record<SignalStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-primary/10 text-primary' },
  in_progress: { label: 'In progress', className: 'bg-tertiary-container/25 text-tertiary' },
  resolved: { label: 'Resolved', className: 'bg-surface-container text-on-surface-variant' },
}

const MAX_PROMPT = 300

const timeAgo = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function SignalsView() {
  useDocumentTitle('Signals')
  const { clusterId = '' } = useParams()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const signals = useClusterSignals(clusterId)
  const replyCounts = useSignalReplyCounts(clusterId)
  const members = useClusterMembers(clusterId)
  const raise = useRaiseSignal(clusterId)

  const [modalOpen, setModalOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const myMutes = useMyMutes(clusterId !== '')
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }

  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data])
  const replyCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of replyCounts.data ?? []) {
      map.set(r.signal_id, r.reply_count)
    }
    return map
  }, [replyCounts.data])

  const active = useMemo(() => (signals.data ?? []).filter((s) => s.status !== 'resolved'), [signals.data])
  const resolved = useMemo(() => (signals.data ?? []).filter((s) => s.status === 'resolved'), [signals.data])

  async function handleRaise() {
    const trimmed = prompt.trim()
    if (!trimmed) return
    setError(null)
    try {
      await raise.mutateAsync(trimmed)
      setModalOpen(false)
      setPrompt('')
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-on-surface">Signals</h2>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-on-surface-variant">
            Raise a signal when you need help or a hand.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="Raise a signal"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Raise
          </button>
        </div>
      </div>

      {signals.isLoading || myMutes.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading signals…
        </div>
      ) : (
        <>
          {active.length === 0 && resolved.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
              No signals yet. Need help with something? Raise the first signal.
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <ul className="space-y-3">
                  {active.map((s) => {
                    const sMuted = isMutedAuthor(mutedSet, s.author_id)
                    if (sMuted && !revealed.has(s.id)) {
                      return (
                        <li key={s.id}>
                          <MutedPlaceholder
                            name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                            onToggle={() => toggleReveal(s.id)}
                            kind="signal"
                          />
                        </li>
                      )
                    }
                    return (
                      <SignalCard
                        key={s.id}
                        signal={s}
                        memberById={memberById}
                        replyCount={replyCount.get(s.id) ?? 0}
                        isMine={s.author_id === userId}
                        mutedBanner={
                          sMuted ? (
                            <MutedHideBar
                              name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                              onToggle={() => toggleReveal(s.id)}
                              kind="signal"
                            />
                          ) : undefined
                        }
                      />
                    )
                  })}
                </ul>
              )}

              {resolved.length > 0 && (
                <details className="group rounded-2xl border border-outline-variant/60 bg-surface shadow-soft">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface">
                    <span>
                      Resolved ({resolved.length})
                    </span>
                    <span aria-hidden className="transition-transform group-open:rotate-180">
                      <ChevronDown className="h-4 w-4" strokeWidth={2} />
                    </span>
                  </summary>
                  <ul className="divide-y divide-outline-variant/60 border-t border-outline-variant/60">
                    {resolved.map((s) => {
                      const sMuted = isMutedAuthor(mutedSet, s.author_id)
                      if (sMuted && !revealed.has(s.id)) {
                        return (
                          <li key={s.id} className="p-4">
                            <MutedPlaceholder
                              name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                              onToggle={() => toggleReveal(s.id)}
                              kind="signal"
                            />
                          </li>
                        )
                      }
                      return (
                        <SignalCard
                          key={s.id}
                          signal={s}
                          memberById={memberById}
                          replyCount={replyCount.get(s.id) ?? 0}
                          isMine={s.author_id === userId}
                          compact
                          mutedBanner={
                            sMuted ? (
                              <div className="px-4 pt-3">
                                <MutedHideBar
                                  name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                                  onToggle={() => toggleReveal(s.id)}
                                  kind="signal"
                                />
                              </div>
                            ) : undefined
                          }
                        />
                      )
                    })}
                  </ul>
                </details>
              )}
            </>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Raise a signal">
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void handleRaise()
          }}
        >
          <label htmlFor="signal-prompt" className="sr-only">
            What do you need help with?
          </label>
          <textarea
            id="signal-prompt"
            rows={4}
            maxLength={MAX_PROMPT}
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What do you need help with?"
            className="w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-sm leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-on-surface-variant">{prompt.length}/{MAX_PROMPT}</span>
            <div className="flex items-center gap-2">
              {error && (
                <span role="alert" className="text-xs text-error">
                  {error}
                </span>
              )}
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[44px] rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!prompt.trim() || raise.isPending}
                className="min-h-[48px] rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
              >
                {raise.isPending ? 'Raising…' : 'Raise signal'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function SignalCard({
  signal,
  memberById,
  replyCount,
  isMine,
  compact = false,
  mutedBanner,
}: {
  signal: Signal
  memberById: Map<string, { display_name: string; avatar_url: string | null }>
  replyCount: number
  isMine: boolean
  compact?: boolean
  mutedBanner?: ReactNode
}) {
  const { clusterId = '' } = useParams()
  const meta = statusMeta[signal.status]
  const author = memberById.get(signal.author_id)
  return (
    <li>
      {mutedBanner}
      <Link
        to={`/cluster/${clusterId}/signals/${signal.id}`}
        className={cn(
          'block rounded-2xl border border-outline-variant/60 bg-surface shadow-soft transition-colors hover:border-outline/60',
          compact ? 'px-4 py-3' : 'p-4',
        )}
      >
        <div className="flex items-center gap-x-2">
          <Avatar
            name={author?.display_name ?? 'Member'}
            src={author?.avatar_url}
            className="h-6 w-6 shrink-0"
            textClassName="text-[11px]"
          />
          <span className="min-w-0 truncate text-sm font-medium text-on-surface">
            {author?.display_name ?? 'Member'}
          </span>
          {isMine && <span className="shrink-0 text-xs text-on-surface-variant">(you)</span>}
          <span className="shrink-0 text-xs text-on-surface-variant">· {timeAgo.format(new Date(signal.created_at))}</span>
          <span className={cn('ml-auto shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold', meta.className)}>
            {meta.label}
          </span>
        </div>
        <p className={cn('mt-1.5 leading-6 text-on-surface', compact ? 'line-clamp-2 text-sm' : 'text-[15px]')}>
          {signal.prompt}
        </p>
        <p className="mt-1.5 flex items-center gap-2 text-sm text-on-surface-variant">
          <MessageSquare className="h-5 w-5" strokeWidth={2} aria-hidden />
          {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
        </p>
      </Link>
    </li>
  )
}
