import { useEffect, useState } from 'react'
import { ChevronRight, UserRound } from 'lucide-react'
import { useProfile } from '../lib/use-profile'
import { useUpdateProfile } from '../features/cluster'
import {
  DEFAULT_PROFILE_STATUS,
  isProfileStatus,
  profileStatusMeta,
  type ProfileStatus,
} from '../lib/profile-status'
import { cn } from '../lib/utils'
import { ProfileStatusDialog } from './ProfileStatusDialog'

export function ProfileStatusSection() {
  const profile = useProfile()
  const updateProfile = useUpdateProfile()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [optimistic, setOptimistic] = useState<ProfileStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saved = profile.data?.manual_status
  const current: ProfileStatus =
    optimistic ?? (isProfileStatus(saved) ? saved : DEFAULT_PROFILE_STATUS)
  const meta = profileStatusMeta(current)

  // Clear the optimistic value once the refetch lands. Clearing in onSettled
  // would flash back to the stale value on slow networks.
  useEffect(() => {
    if (optimistic !== null && saved === optimistic) setOptimistic(null)
  }, [optimistic, saved])

  function handleSelect(next: ProfileStatus) {
    setDialogOpen(false)
    setError(null)
    setOptimistic(next)
    updateProfile.mutate(
      { manual_status: next },
      {
        onError: () => {
          setError('Could not save your status. Please try again.')
          setOptimistic(null)
        },
      },
    )
  }

  return (
    <section aria-label="Status" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <UserRound className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
        <h2 className="font-display text-lg font-semibold text-on-surface">Status</h2>
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">
        Your status is visible to your cluster.
      </p>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        data-e2e="status-trigger"
        aria-haspopup="dialog"
        className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-outline-variant/60 bg-surface-container/50 px-4 py-3 text-left transition-colors hover:bg-surface-container"
      >
        <span className={cn('h-3 w-3 shrink-0 rounded-full', meta.dotClass)} aria-hidden />
        <span className="flex-1 text-base font-semibold text-on-surface">{meta.label}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
      <ProfileStatusDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        current={current}
        onSelect={handleSelect}
      />
    </section>
  )
}
