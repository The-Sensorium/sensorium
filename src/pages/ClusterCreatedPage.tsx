import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Cake, Loader2, MapPin, PartyPopper } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { requireSupabase } from '../lib/supabase'
import { countryName } from '../lib/countries'
import {
  useLatestClusterFormed,
  useClusterMembers,
  type ClusterFormedNotification,
} from '../features/matching'

export function ClusterCreatedPage() {
  useDocumentTitle('Cluster Created')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const formed = useLatestClusterFormed()
  const [notif, setNotif] = useState<ClusterFormedNotification | null>(null)

  useEffect(() => {
    if (formed.data && !notif) {
      setNotif(formed.data)
      const supabase = requireSupabase()
      void supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', formed.data.id)
        .then(({ error }) => {
          if (!error && formed.data) {
            void queryClient.invalidateQueries({ queryKey: ['cluster-formed'] })
          }
        })
    }
  }, [formed.data, notif, queryClient])

  const clusterId = notif?.cluster_id ?? null
  const members = useClusterMembers(clusterId, clusterId !== null)

  if (!notif && formed.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!clusterId) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
        <h1 className="font-display text-xl font-semibold text-on-surface">No new cluster</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          There isn’t a cluster ready to introduce yet. Keep waiting in a queue and you’ll be
          matched soon.
        </p>
        <Link
          to="/home"
          className="mt-5 inline-flex items-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-2">
      <div className="rounded-2xl border border-primary/30 bg-primary-container/10 p-8 text-center shadow-soft">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary text-on-primary shadow-lift">
          <PartyPopper className="h-8 w-8" strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-3xl font-semibold text-on-surface">
          Your cluster is ready
        </h1>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          Eight strangers matched. Complete your introductions within 72 hours to unlock the chat.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-on-surface">Your new cluster</h2>
        {members.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading members…
          </div>
        ) : (
          <ul
            aria-label="Cluster members"
            className="divide-y divide-outline-variant/60 rounded-2xl border border-outline-variant/60 bg-surface shadow-soft"
          >
            {(members.data ?? []).map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-container/25 font-display text-base font-semibold text-primary">
                  {member.display_name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-on-surface">
                    {member.display_name}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                    {member.country_code && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden />
                        {countryName(member.country_code)}
                      </span>
                    )}
                    {member.birth_year && (
                      <span className="inline-flex items-center gap-1">
                        <Cake className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden />
                        {member.birth_year}
                      </span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => navigate(`/cluster/${clusterId}/introductions`)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
      >
        Start introductions <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
