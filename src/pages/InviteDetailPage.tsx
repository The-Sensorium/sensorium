import { Link, useNavigate, useParams } from 'react-router'
import { useState } from 'react'
import { ArrowLeft, Check, Clock, Loader2, UserPlus } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'
import { toErrorMessage } from '../lib/error'
import { useCreatedInviteDetail } from '../features/created-clusters'
import { useAcceptInvitation, useDeclineInvitation } from '../features/votes'

type DetailMember = { id: string; display_name: string }

export function InviteDetailPage() {
  useDocumentTitle('Cluster invitation')
  const { invitationId = '' } = useParams()
  const navigate = useNavigate()
  const detail = useCreatedInviteDetail(invitationId)
  const accept = useAcceptInvitation()
  const decline = useDeclineInvitation()
  const [confirmingDecline, setConfirmingDecline] = useState(false)

  const info = detail.data
  const members = ((info?.members ?? []) as DetailMember[]).filter((m) => m && m.id)
  const error =
    toErrorMessage(detail.error, '') ||
    toErrorMessage(accept.error, '') ||
    toErrorMessage(decline.error, '')

  async function onAccept() {
    try {
      await accept.mutateAsync(invitationId)
      navigate(`/cluster/${info?.cluster_id}/members`)
    } catch {
      // Surfaced via accept.error above; stay so the user sees it.
    }
  }

  async function onDecline() {
    try {
      await decline.mutateAsync(invitationId)
      setConfirmingDecline(false)
      navigate('/home')
    } catch {
      // Surfaced via decline.error inside the confirm dialog; stay open to retry.
    }
  }

  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading invitation…
      </div>
    )
  }

  if (!info) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          Home
        </Link>
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
          This invitation isn’t available. It may have been answered or withdrawn.
        </div>
      </div>
    )
  }

  const pendingSlots = Math.max(0, (info.pending_count ?? 0) - 1)

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <header className="pt-2">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          Home
        </Link>
        <div className="mt-4 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/15 text-primary">
            <UserPlus className="h-7 w-7" strokeWidth={1.5} aria-hidden />
          </span>
        </div>
        <h1 className="mt-3 text-center font-display text-2xl font-semibold text-on-surface">
          You’ve been invited to join a cluster
        </h1>
        <p className="mt-1 text-center text-sm text-on-surface-variant">
          {info.creator_name} invited you to join {info.cluster_name}.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5" aria-label="People involved">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-on-surface">{info.cluster_name}</h2>
          <span className="shrink-0 rounded-pill bg-surface-lowest px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
            {info.member_count} {info.member_count === 1 ? 'member' : 'members'}
          </span>
        </div>
        <ul className="mt-4 space-y-3">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3">
              <Avatar name={member.display_name} src={null} className="h-10 w-10" />
              <span className="min-w-0 flex-1 truncate text-sm text-on-surface">
                {member.display_name}
              </span>
              {member.id === info.creator_id ? (
                <span className="rounded-pill bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                  Creator
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  Joined
                </span>
              )}
            </li>
          ))}
        </ul>
        {pendingSlots > 0 && (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            {pendingSlots} more {pendingSlots === 1 ? 'invitation' : 'invitations'} pending
          </p>
        )}
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          data-e2e="invite-decline"
          disabled={accept.isPending || decline.isPending}
          onClick={() => setConfirmingDecline(true)}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-pill border border-outline-variant/60 px-5 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
        >
          Decline
        </button>
        <button
          type="button"
          data-e2e="invite-accept"
          disabled={accept.isPending || decline.isPending}
          onClick={() => void onAccept()}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
        >
          {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Accept invitation'}
        </button>
      </div>

      <Modal
        open={confirmingDecline}
        onClose={() => setConfirmingDecline(false)}
        title="Decline invitation?"
      >
        <p className="text-sm text-on-surface-variant">
          You won’t be invited to {info.cluster_name} again. You can still be invited to other
          clusters.
        </p>
        {decline.error && (
          <p role="alert" className="mt-3 rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
            {toErrorMessage(decline.error, 'Could not decline the invitation. Please try again.')}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDecline(false)}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-pill border border-outline-variant/60 px-5 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Keep invitation
          </button>
          <button
            type="button"
            data-e2e="confirm-decline-invitation"
            disabled={decline.isPending}
            onClick={() => void onDecline()}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {decline.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Decline'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
