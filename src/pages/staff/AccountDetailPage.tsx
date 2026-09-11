import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { formatError } from '../../features/admin-moderation'
import { useMyAccess, type Capability } from '../../features/access'
import {
  useAccountHistory,
  useLiftRestriction,
  useStaffAccountDetail,
  useStaffBase,
} from '../../features/admin-accounts'
import { timeAgo } from '../../features/notifications'

function has(access: ReturnType<typeof useMyAccess>['data'], cap: Capability) {
  return access?.capabilities.includes(cap) ?? false
}

export function AccountDetailPage() {
  useDocumentTitle('Account')
  const { userId } = useParams<{ userId: string }>()
  const base = useStaffBase()
  const detail = useStaffAccountDetail(userId)
  const history = useAccountHistory(userId)
  const access = useMyAccess()
  const lift = useLiftRestriction()
  const [reason, setReason] = useState('')
  const [confirmLift, setConfirmLift] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const data = detail.data
  const entries = history.data?.pages.flat() ?? []
  const isAdmin = has(access.data, 'can_manage_roles')
  const restricted = data != null && data.account_status !== 'active'
  const isStaffTarget = (data?.roles.length ?? 0) > 0
  const liftBlockedNote =
    data?.account_status === 'banned' && !isAdmin
      ? 'Only an admin can lift a permanent ban.'
      : isStaffTarget && !isAdmin
        ? 'Only an admin can change a staff member’s restriction.'
        : null

  async function confirm() {
    if (!userId || !reason.trim()) return
    setError(null)
    setSuccess(null)
    try {
      await lift.mutateAsync({ p_user_id: userId, p_reason: reason.trim() })
      setSuccess('Restriction lifted.')
      setReason('')
      setConfirmLift(false)
    } catch (e) {
      setError(formatError(e))
    }
  }

  if (detail.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  if (detail.isError || !data) {
    return (
      <div className="rounded-2xl border border-error/30 bg-error/10 p-10 text-center">
        <p className="text-sm font-semibold text-error">Could not load this account.</p>
        <button
          type="button"
          onClick={() => void detail.refetch()}
          className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3 pt-2">
        <Link
          to={`${base}/accounts`}
          className="grid h-9 w-9 place-items-center rounded-pill border border-outline-variant/60 text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">{data.display_name}</h1>
          <p className="mt-1 text-sm capitalize text-on-surface-variant">
            {data.account_status} account
            {data.email ? ` · ${data.email}` : ''}
          </p>
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}
      {success && <p role="status" className="rounded-2xl border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{success}</p>}

      {restricted && (
        <section className="rounded-2xl border border-error/30 bg-error/10 p-5">
          <h2 className="text-sm font-semibold capitalize text-error">Account {data.account_status}</h2>
          <p className="mt-1 text-sm text-on-surface">
            {data.restriction_reason ?? 'No reason recorded.'}
            {data.restriction_expires_at ? ` · expires ${timeAgo(data.restriction_expires_at)}` : ''}
          </p>
          {liftBlockedNote ? (
            <p className="mt-3 text-xs text-on-surface-variant">{liftBlockedNote}</p>
          ) : (
            <div className="mt-3">
              {!confirmLift ? (
                <button
                  type="button"
                  onClick={() => setConfirmLift(true)}
                  className="rounded-pill border border-error/40 px-4 py-2 text-sm font-semibold text-error transition-colors hover:bg-error/10"
                >
                  Lift restriction
                </button>
              ) : (
                <div className="space-y-2">
                  <input
                    aria-label="Lift reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this restriction being lifted…"
                    maxLength={2000}
                    className="w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmLift(false)}
                      className="rounded-pill px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirm()}
                      disabled={lift.isPending || !reason.trim()}
                      className="rounded-pill bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary disabled:opacity-40"
                    >
                      {lift.isPending ? 'Lifting…' : 'Confirm lift'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-on-surface">Identity</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Member since</dt>
              <dd className="font-medium text-on-surface">{timeAgo(data.account_created_at)}</dd>
            </div>
            {data.roles.length > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Roles</dt>
                <dd className="flex flex-wrap justify-end gap-1">
                  {data.roles.map((role) => (
                    <span key={role} className="rounded-pill bg-surface-container px-2 py-0.5 text-[11px] font-semibold capitalize text-on-surface-variant">
                      {role}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {data.cluster_names.length > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Clusters</dt>
                <dd className="max-w-48 truncate font-medium text-on-surface" title={data.cluster_names.join(', ')}>
                  {data.cluster_names.join(', ')}
                </dd>
              </div>
            )}
          </dl>
          {isAdmin && (
            <Link to="/admin/roles" className="mt-3 inline-block text-xs font-semibold text-primary">
              Manage roles
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-on-surface">Moderation summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Open reports against</dt>
              <dd className="font-medium text-on-surface">{data.open_reports_against}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Total reports against</dt>
              <dd className="font-medium text-on-surface">{data.total_reports_against}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Reports filed</dt>
              <dd className="font-medium text-on-surface">{data.reports_filed}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Enforcement actions</dt>
              <dd className="font-medium text-on-surface">{data.enforcement_count}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Appeals</dt>
              <dd className="font-medium text-on-surface">{data.appeals_count}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-on-surface">Moderation history</h2>
        {history.isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          </div>
        ) : history.isError ? (
          <div className="mt-3 rounded-xl border border-error/30 bg-error/10 p-4 text-center">
            <p className="text-sm font-semibold text-error">Couldn’t load history.</p>
            <button
              type="button"
              onClick={() => void history.refetch()}
              className="mt-3 rounded-pill bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary"
            >
              Try Again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="mt-3 rounded-xl bg-surface-container/60 p-4 text-sm text-on-surface-variant">
            No moderation history for this account.
          </p>
        ) : (
          <>
            <ol className="mt-3 space-y-2">
              {entries.map((entry) => (
                <li key={`${entry.kind}-${entry.entry_id}`} data-e2e="account-history-row" className="rounded-xl bg-surface-container/60 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm text-on-surface">
                      <span className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-semibold capitalize text-on-surface-variant">
                        {entry.kind}
                      </span>{' '}
                      {entry.summary}
                    </p>
                    <span className="shrink-0 text-[11px] text-on-surface-variant">{timeAgo(entry.created_at)}</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs font-semibold">
                    {entry.report_id && <Link to={`${base}/reports/${entry.report_id}`} className="text-primary">Open case</Link>}
                    {entry.appeal_id && isAdmin && <Link to={`/admin/appeals/${entry.appeal_id}`} className="text-primary">Open appeal</Link>}
                  </div>
                </li>
              ))}
            </ol>
            {history.hasNextPage && !history.isFetchingNextPage && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => void history.fetchNextPage()}
                  className="rounded-pill border border-outline-variant/60 px-4 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container"
                >
                  Load older entries
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
