import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { ChevronDown, Loader2, MessageSquare, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useClusterMembers } from '../../features/matching'
import { useClusterSignals, useSignalReplies, useRaiseSignal } from '../../features/signals'
import type { Signal, SignalStatus } from '../../features/signals'
import { useAuth } from '../../app/auth-context'
import { Avatar } from '../../components/Avatar'
import { Modal } from '../../components/Modal'

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
  const replies = useSignalReplies(clusterId, null)
  const members = useClusterMembers(clusterId)
  const raise = useRaiseSignal(clusterId)

  const [modalOpen, setModalOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const memberById = new Map((members.data ?? []).map((m) => [m.id, m]))
  const replyCount = new Map<string, number>()
  for (const r of replies.data ?? []) {
    replyCount.set(r.signal_id, (replyCount.get(r.signal_id) ?? 0) + 1)
  }

  const active = (signals.data ?? []).filter((s) => s.status !== 'resolved')
  const resolved = (signals.data ?? []).filter((s) => s.status === 'resolved')

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-on-surface">Signals</h2>
          <p className="text-xs text-on-surface-variant">
            Raise a signal when you need help or a hand.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Raise a signal
        </button>
      </div>

      {signals.isLoading ? (
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
                  {active.map((s) => (
                    <SignalCard
                      key={s.id}
                      signal={s}
                      memberById={memberById}
                      replyCount={replyCount.get(s.id) ?? 0}
                      isMine={s.author_id === userId}
                    />
                  ))}
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
                    {resolved.map((s) => (
                      <SignalCard
                        key={s.id}
                        signal={s}
                        memberById={memberById}
                        replyCount={replyCount.get(s.id) ?? 0}
                        isMine={s.author_id === userId}
                        compact
                      />
                    ))}
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
              {error && <span className="text-xs text-error">{error}</span>}
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-pill px-4 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!prompt.trim() || raise.isPending}
                className="rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
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
}: {
  signal: Signal
  memberById: Map<string, { display_name: string; avatar_url: string | null }>
  replyCount: number
  isMine: boolean
  compact?: boolean
}) {
  const { clusterId = '' } = useParams()
  const meta = statusMeta[signal.status]
  const author = memberById.get(signal.author_id)
  return (
    <li>
      <Link
        to={`/cluster/${clusterId}/signals/${signal.id}`}
        className={cn(
          'block rounded-2xl border border-outline-variant/60 bg-surface shadow-soft transition-colors hover:border-outline/60',
          compact ? 'p-4' : 'p-5',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Avatar
            name={author?.display_name ?? 'Member'}
            src={author?.avatar_url}
            className="h-5 w-5"
            textClassName="text-[10px]"
          />
          <span className="text-sm font-medium text-on-surface">
            {author?.display_name ?? 'Member'}
          </span>
          {isMine && <span className="text-xs text-on-surface-variant">(you)</span>}
          <span className="text-xs text-on-surface-variant">· {timeAgo.format(new Date(signal.created_at))}</span>
          <span className={cn('ml-auto rounded-pill px-2.5 py-1 text-xs font-medium', meta.className)}>
            {meta.label}
          </span>
        </div>
        <p className={cn('mt-2 leading-6 text-on-surface', compact ? 'line-clamp-2 text-sm' : 'text-sm')}>
          {signal.prompt}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
          <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
        </p>
      </Link>
    </li>
  )
}
