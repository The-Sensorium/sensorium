import { useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'
import { useDocumentTitle } from '../lib/use-document-title'
import {
  useCluster,
  useMyMembership,
  useIntroQuestions,
  useSubmitIntroAnswers,
} from '../features/introductions'
import { CountdownTimer } from '../components/CountdownTimer'

export function IntroductionsPage() {
  useDocumentTitle('Introductions')
  const { clusterId = '' } = useParams()
  const cluster = useCluster(clusterId)
  const membership = useMyMembership(clusterId)
  const questions = useIntroQuestions(clusterId !== '')

  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const submit = useSubmitIntroAnswers()

  if (cluster.isLoading || membership.isLoading || questions.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!cluster.data) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
        This cluster isn’t available to you.
      </div>
    )
  }

  // Only a member whose own intro is still pending should be here. If the
  // cluster is already unlocked and they've finished, drop them in the room;
  // otherwise (formation phase) send them to the waiting screen.
  if (membership.data?.intro_completed_at) {
    return (
      <Navigate
        to={
          cluster.data.introductions_completed_at
            ? `/cluster/${clusterId}`
            : `/cluster/${clusterId}/waiting`
        }
        replace
      />
    )
  }

  const deadline = cluster.data.introductions_deadline
  const allAnswered =
    (questions.data?.length ?? 0) > 0 &&
    (questions.data ?? []).every((q) => (answers[q.id] ?? '').trim().length > 0)

  async function handleSubmit() {
    if (!allAnswered || !clusterId) return
    setError(null)
    try {
      await submit.mutateAsync({ clusterId, answers })
    } catch {
      setError('Something went wrong saving your answers. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-2">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Introductions · {cluster.data.name}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-on-surface">
          Tell your cluster who you are
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
          <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden />
          {cluster.data.introductions_completed_at ? (
            'This room is already open. Answer below to join the conversation.'
          ) : (
            <>
              Chat unlocks once everyone answers. Deadline:
              {deadline ? <CountdownTimer deadline={deadline} className="font-semibold" /> : null}
            </>
          )}
        </p>
      </header>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        {(questions.data ?? []).map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
            <label htmlFor={`intro-${q.id}`} className="block text-sm font-semibold text-on-surface">
              {i + 1}. {q.prompt}
            </label>
            <textarea
              id={`intro-${q.id}`}
              rows={3}
              maxLength={1000}
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Write a few honest sentences…"
              className="mt-3 w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-sm leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
            />
            <p
              className={cn(
                'mt-2 text-xs',
                (answers[q.id] ?? '').trim() ? 'text-on-surface-variant/70' : 'text-error',
              )}
            >
              {answers[q.id]?.trim() ? 'Answered' : 'Required'}
            </p>
          </div>
        ))}

        {error && <p className="text-sm text-error">{error}</p>}

        <button
          type="submit"
          disabled={!allAnswered || submit.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
        >
          {submit.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
          )}
          {submit.isPending
            ? 'Saving…'
            : cluster.data.introductions_completed_at
              ? 'Finish introductions'
              : 'Submit introductions'}
        </button>
      </form>
    </div>
  )
}
