import { Link } from 'react-router'
import type { TargetSummary } from '../../../features/admin-moderation'
import { timeUntil } from '../../../features/notifications'

export function TargetPanel({ target, accountHref }: { target: TargetSummary; accountHref?: string | null }) {
  const restricted = target.account_status !== 'active'

  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <h2 className="text-sm font-semibold text-on-surface">Target account</h2>
      {restricted && (
        <p role="alert" className="mt-3 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
          Currently {target.account_status}
          {target.restriction_reason ? ` — ${target.restriction_reason}` : ''}
          {target.restriction_expires_at ? ` (expires ${timeUntil(target.restriction_expires_at)})` : ''}.
        </p>
      )}
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Member</dt>
          <dd className="font-medium text-on-surface">
            {accountHref ? (
              <Link to={accountHref} className="font-semibold text-primary">
                {target.display_name ?? 'Deleted account'}
              </Link>
            ) : (
              (target.display_name ?? 'Deleted account')
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Status</dt>
          <dd className="font-medium capitalize text-on-surface">{target.account_status}</dd>
        </div>
        {target.roles.length > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-on-surface-variant">Roles</dt>
            <dd className="flex flex-wrap justify-end gap-1">
              {target.roles.map((role) => (
                <span key={role} className="rounded-pill bg-surface-container px-2 py-0.5 text-[11px] font-semibold capitalize text-on-surface-variant">
                  {role}
                </span>
              ))}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Prior reports</dt>
          <dd className="font-medium text-on-surface">{target.prior_reports}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Prior enforcement</dt>
          <dd className="font-medium text-on-surface">{target.prior_actions} actions</dd>
        </div>
        {target.cluster_names.length > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-on-surface-variant">Clusters</dt>
            <dd className="max-w-48 truncate font-medium text-on-surface" title={target.cluster_names.join(', ')}>
              {target.cluster_names.join(', ')}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
