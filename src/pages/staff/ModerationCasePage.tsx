import { useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import {
  formatError,
  reporterSummary,
  targetSummary,
  useCaseTimeline,
  useClaimReport,
  useHideMessage,
  useModeratedMessage,
  useModerationCaseV2,
  useReleaseReport,
  useResolveReport,
  useRestoreMessage,
} from '../../features/admin-moderation'
import { useMyAccess, type Capability } from '../../features/access'
import { CaseHeader } from './components/CaseHeader'
import { EvidencePanel } from './components/EvidencePanel'
import { ReporterPanel } from './components/ReporterPanel'
import { TargetPanel } from './components/TargetPanel'
import { CaseTimeline } from './components/CaseTimeline'
import { CaseActionPanel } from './components/CaseActionPanel'

function has(access: ReturnType<typeof useMyAccess>['data'], cap: Capability) {
  return access?.capabilities.includes(cap) ?? false
}

export function ModerationCasePage() {
  useDocumentTitle('Report case')
  const { reportId } = useParams<{ reportId: string }>()
  const { pathname } = useLocation()
  const backPath = pathname.replace(/\/[^/]+$/, '')
  const report = useModerationCaseV2(reportId)
  const messageQuery = useModeratedMessage(reportId)
  const timeline = useCaseTimeline(reportId)
  const access = useMyAccess()
  const data = report.data
  const msg = messageQuery.data

  const claim = useClaimReport()
  const release = useReleaseReport()
  const resolve = useResolveReport()
  const hideMessage = useHideMessage()
  const restoreMessage = useRestoreMessage()

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (report.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  if (report.isError || !data) {
    return (
      <div className="rounded-2xl border border-error/30 bg-error/10 p-10 text-center">
        <p className="text-sm font-semibold text-error">Could not load this report.</p>
        <button
          type="button"
          onClick={() => void report.refetch()}
          className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Try Again
        </button>
      </div>
    )
  }

  const claimedByMe = data.assigned_to === access.data?.user_id
  const isModerator = has(access.data, 'can_moderate')
  const isAdmin = has(access.data, 'can_apply_permanent_restriction')
  const open = data.status === 'pending' || data.status === 'reviewing'
  const accountBusy = claim.isPending || release.isPending || resolve.isPending
  const contentBusy = hideMessage.isPending || restoreMessage.isPending

  async function run<A extends object>(mut: { mutateAsync: (args: A) => Promise<unknown> }, args: A) {
    setError(null)
    setSuccess(null)
    try {
      await mut.mutateAsync(args)
      setSuccess('Action completed successfully.')
    } catch (e) {
      setError(formatError(e))
    }
  }

  return (
    <div className="space-y-6">
      <CaseHeader
        backPath={backPath}
        data={data}
        claimedByMe={claimedByMe}
        open={open}
        busy={accountBusy}
        claimPending={claim.isPending}
        onClaim={() => void run(claim, { p_report_id: data.id })}
        onRelease={() => void run(release, { p_report_id: data.id })}
        onDismiss={() => void run(resolve, { p_report_id: data.id, p_status: 'dismissed', p_note: 'no action taken' })}
      />

      {error && <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}
      {success && <p role="status" className="rounded-2xl border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{success}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <EvidencePanel
          data={data}
          msg={msg ?? null}
          canAct={claimedByMe && open}
          busy={contentBusy}
          hidePending={hideMessage.isPending}
          restorePending={restoreMessage.isPending}
          onHide={() =>
            msg &&
            void run(hideMessage, {
              p_message_id: msg.message_id,
              p_reason: 'reported content',
              p_report_id: data.id,
            })
          }
          onRestore={() =>
            msg &&
            void run(restoreMessage, {
              p_message_id: msg.message_id,
              p_reason: 'false positive review',
              p_report_id: data.id,
            })
          }
        />
        <div className="grid content-start gap-4">
          <ReporterPanel reporter={reporterSummary(data)} />
          <TargetPanel target={targetSummary(data)} />
        </div>
      </div>

      <CaseTimeline
        reportId={data.id}
        entries={timeline.data ?? []}
        isLoading={timeline.isLoading}
        isError={timeline.isError}
        onRetry={() => void timeline.refetch()}
        myUserId={access.data?.user_id ?? null}
        isAdmin={isAdmin}
        canNote={open && (claimedByMe || isAdmin)}
      />

      <CaseActionPanel
        data={data}
        claimedByMe={claimedByMe}
        open={open}
        isModerator={isModerator}
        isAdmin={isAdmin}
      />

      {!claimedByMe && !open ? (
        <p className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-4 text-sm text-on-surface-variant">
          This case is closed. Link it to a follow-up report if further action is needed.
        </p>
      ) : null}
    </div>
  )
}
