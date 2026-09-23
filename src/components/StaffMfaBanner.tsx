import { Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { hasCapability } from '../features/access'
import { useMfaStatus } from '../features/staff-mfa'
import type { MyAccessRow } from '../features/access'

/** Voluntary enrollment nudge for staff without a verified authenticator. */
export function StaffMfaBanner({ access }: { access: MyAccessRow }) {
  const mfa = useMfaStatus(hasCapability(access, 'can_moderate'))

  if (mfa.isLoading || mfa.isError) return null
  if (!hasCapability(access, 'can_moderate')) return null
  if ((mfa.data?.verifiedTotpCount ?? 0) > 0) return null

  return (
    <div
      data-e2e="mfa-banner"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant/60 bg-surface px-4 py-3"
    >
      <span className="flex items-center gap-2 text-sm text-on-surface">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
        Staff sign-ins will soon require two-step verification.
      </span>
      <Link to="/mfa-setup" className="text-sm font-semibold text-primary hover:underline">
        Set it up now
      </Link>
    </div>
  )
}
