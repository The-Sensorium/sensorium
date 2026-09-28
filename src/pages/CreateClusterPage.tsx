import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Check, Loader2, Search, Users } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useProfile } from '../lib/use-profile'
import { Avatar } from '../components/Avatar'
import { inviteErrorMessage, toErrorMessage } from '../lib/error'
import {
  useCreateCluster,
  useEligibleComembers,
} from '../features/created-clusters'

const NAME_LIMIT = 50
const MIN_INVITEES = 2
const MAX_INVITEES = 7

export function CreateClusterPage() {
  useDocumentTitle('Create a cluster')
  const navigate = useNavigate()
  const profile = useProfile()
  const eligible = useEligibleComembers()
  const create = useCreateCluster()

  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [capped, setCapped] = useState(false)

  const trimmed = name.trim()
  const nameValid = trimmed.length >= 1 && trimmed.length <= NAME_LIMIT

  const people = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = eligible.data ?? []
    if (!q) return list
    return list.filter((p) => (p.display_name ?? '').toLowerCase().includes(q))
  }, [eligible.data, search])

  const selectedPeople = useMemo(() => {
    const byId = new Map((eligible.data ?? []).map((p) => [p.user_id, p]))
    return selected.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []))
  }, [eligible.data, selected])

  function toggle(id: string) {
    if (selected.includes(id)) {
      setCapped(false)
      setSelected(selected.filter((s) => s !== id))
    } else if (selected.length >= MAX_INVITEES) {
      setCapped(true)
    } else {
      setSelected([...selected, id])
    }
  }

  async function send() {
    // Submit exactly the roster shown on the review step.
    const inviteeIds = selectedPeople.map((p) => p.user_id)
    const clusterId = await create.mutateAsync({ name: trimmed, inviteeIds })
    navigate(`/cluster/${clusterId}/members`)
  }

  const error = inviteErrorMessage(create.error, '') || toErrorMessage(eligible.error, '')

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <header className="pt-2">
        <Link
          to="/clusters"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          Clusters
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold text-on-surface">
          {step === 0 ? 'Name your cluster' : step === 1 ? 'Invite people' : 'Review your cluster'}
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {step === 0
            ? 'Give your cluster a name.'
            : step === 1
              ? 'You can invite people you’ve previously shared a cluster with.'
              : 'You’ll send invitations to these people. The cluster becomes active once at least 3 members have joined.'}
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {error}
        </p>
      )}

      {step === 0 && (
        <section className="space-y-4" aria-label="Cluster name">
          <div>
            <label htmlFor="create-cluster-name" className="text-sm font-semibold text-on-surface">
              Cluster name
            </label>
            <input
              id="create-cluster-name"
              data-e2e="create-cluster-name"
              type="text"
              value={name}
              maxLength={NAME_LIMIT}
              onChange={(e) => setName(e.target.value)}
              placeholder="Late Night Crew"
              className="mt-2 w-full rounded-2xl border border-outline-variant bg-surface-container px-4 py-3 text-base text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <p className="mt-1 text-right text-xs text-on-surface-variant">
              {trimmed.length}/{NAME_LIMIT}
            </p>
          </div>
          <button
            type="button"
            data-e2e="create-cluster-continue"
            disabled={!nameValid}
            onClick={() => setStep(1)}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            Continue
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4" aria-label="Invite people">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" aria-hidden />
            <input
              type="search"
              data-e2e="create-cluster-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              aria-label="Search people"
              className="w-full rounded-2xl border border-outline-variant bg-surface-container py-3 pl-11 pr-4 text-base text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>

          {eligible.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading people…
            </div>
          ) : (eligible.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
              <Users className="mx-auto h-6 w-6" strokeWidth={1.5} aria-hidden />
              <p className="mt-3">
                No one to invite yet. You’ll see people here after you’ve shared a cluster with
                them.
              </p>
              <Link to="/clusters" className="mt-3 inline-block font-semibold text-primary">
                Back to clusters
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-on-surface">People you’ve shared clusters with</p>
              <ul className="space-y-2">
                {people.map((person) => {
                  const checked = selected.includes(person.user_id)
                  return (
                    <li key={person.user_id}>
                      <button
                        type="button"
                        data-e2e={`create-cluster-member-${person.user_id}`}
                        onClick={() => toggle(person.user_id)}
                        aria-pressed={checked}
                        className="flex w-full items-center gap-3 rounded-2xl border border-outline-variant/60 bg-surface p-3 text-left transition-colors hover:bg-surface-high"
                      >
                        <Avatar name={person.display_name} src={person.avatar_url} className="h-11 w-11" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
                          {person.display_name}
                        </span>
                        <span
                          aria-hidden
                          className={
                            checked
                              ? 'grid h-6 w-6 place-items-center rounded-full bg-primary text-on-primary'
                              : 'grid h-6 w-6 place-items-center rounded-full border border-outline-variant text-transparent'
                          }
                        >
                          <Check className="h-4 w-4" strokeWidth={2.5} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {people.length === 0 && (
                <p className="text-sm text-on-surface-variant">No matches for “{search.trim()}”.</p>
              )}
            </>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-on-surface-variant" aria-live="polite">
              {selected.length} selected
              {selected.length > 0 && selected.length < MIN_INVITEES && ' · pick at least 2'}
              {capped && ` · up to ${MAX_INVITEES} people per cluster`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-pill border border-outline-variant/60 px-5 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              Back
            </button>
            <button
              type="button"
              data-e2e="create-cluster-review-continue"
              disabled={selected.length < MIN_INVITEES}
              onClick={() => setStep(2)}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4" aria-label="Review invitations">
          <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Cluster name
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-on-surface">{trimmed}</p>
          </div>
          <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Invitations ({selectedPeople.length} {selectedPeople.length === 1 ? 'person' : 'people'})
            </p>
            <ul className="mt-3 space-y-3">
              <li className="flex items-center gap-3">
                <Avatar
                  name={profile.data?.display_name ?? 'You'}
                  src={profile.data?.avatar_url ?? null}
                  className="h-10 w-10"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
                  You
                </span>
                <span className="rounded-pill bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                  Creator
                </span>
              </li>
              {selectedPeople.map((person) => (
                <li key={person.user_id} className="flex items-center gap-3">
                  <Avatar name={person.display_name} src={person.avatar_url} className="h-10 w-10" />
                  <span className="min-w-0 flex-1 truncate text-sm text-on-surface">
                    {person.display_name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-pill border border-outline-variant/60 px-5 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              Back
            </button>
            <button
              type="button"
              data-e2e="create-cluster-send"
              disabled={create.isPending}
              onClick={() => void send().catch(() => {})}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Send invitations
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
