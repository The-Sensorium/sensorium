import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EvidencePanel } from './EvidencePanel'

vi.mock('../../../features/posts', () => ({
  usePostImageUrl: () => ({ data: null }),
}))

function renderEvidence(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
import { ReporterPanel } from './ReporterPanel'
import { TargetPanel } from './TargetPanel'
import type { ModerationCaseV2Row } from '../../../features/admin-moderation'

const row = {
  id: 'r-1',
  cluster_id: 'c-1',
  cluster_name: 'Aurora',
  reason: 'harassment',
  details: 'Heated thread',
  target_kind: 'message',
  message_id: 'm-1',
  post_id: null,
  comment_id: null,
  status: 'reviewing',
  severity: 'high',
  priority_score: 75,
  due_at: null,
  last_activity_at: '2026-08-01T00:00:00Z',
  assigned_to: 'mod-1',
  assigned_to_display_name: 'Mara',
  reviewed_by: null,
  resolution_note: null,
  evidence: null,
  escalated_at: null,
  escalated_by: null,
  escalation_reason: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  prior_reports: 2,
  reporter: {
    display_name: 'Diya Sharma',
    account_created_at: '2025-01-01T00:00:00Z',
    reports_30d: 1,
    total_reports: 4,
    dismissed_reports: 3,
  },
  target: {
    display_name: 'Rio Mendez',
    account_status: 'suspended',
    restriction_expires_at: null,
    restriction_reason: 'spam wave',
    roles: ['moderator'],
    cluster_names: ['Aurora'],
    prior_reports: 2,
    prior_actions: 1,
  },
  target_user_id: 'u-1',
} as unknown as ModerationCaseV2Row

describe('case context panels', () => {
  it('EvidencePanel shows report detail and the reported message', () => {
    renderEvidence(
      <EvidencePanel
        data={row}
        msg={{ message_id: 'm-1', author_id: 'u-1', content: 'Reported text', image_url: '', created_at: '' }}
        canAct={false}
        busy={false}
        hidePending={false}
        restorePending={false}
        onHide={() => {}}
        onRestore={() => {}}
      />,
    )
    expect(screen.getByText('Heated thread')).toBeInTheDocument()
    expect(screen.getByText('Reported text')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide message' })).not.toBeInTheDocument()
  })

  it('EvidencePanel offers hide/restore when the viewer can act', () => {
    renderEvidence(
      <EvidencePanel
        data={row}
        msg={{ message_id: 'm-1', author_id: 'u-1', content: 'Reported text', image_url: '', created_at: '' }}
        canAct
        busy={false}
        hidePending={false}
        restorePending={false}
        onHide={() => {}}
        onRestore={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Hide message' })).toBeInTheDocument()
  })

  it('ReporterPanel shows history and dismissed ratio', () => {
    render(<ReporterPanel reporter={{ id: 'x', display_name: 'Diya Sharma', account_created_at: '2025-01-01T00:00:00Z', reports_30d: 1, total_reports: 4, dismissed_reports: 3 }} />)
    expect(screen.getByText('Diya Sharma')).toBeInTheDocument()
    expect(screen.getByText('3/4 (75%)')).toBeInTheDocument()
  })

  it('EvidencePanel renders a reported post with hide action and member link', () => {
    const postRow = {
      ...row,
      target_kind: 'post',
      post_id: 'p-1',
      message_id: null,
      post: {
        id: 'p-1',
        title: 'Reported title',
        content: 'Reported post body',
        image_path: null,
        gif_url: null,
        author_id: 'u-1',
        author_display_name: 'Rio Mendez',
        cluster_id: 'c-1',
        cluster_name: 'Aurora',
        moderation_status: 'approved',
        deleted_at: null,
        created_at: '2026-08-01T00:00:00Z',
      },
      comment: null,
    } as unknown as ModerationCaseV2Row
    renderEvidence(
      <EvidencePanel
        data={postRow}
        msg={null}
        canAct
        busy={false}
        hidePending={false}
        restorePending={false}
        onHide={() => {}}
        onRestore={() => {}}
      />,
    )
    expect(screen.getByText('Reported post')).toBeInTheDocument()
    expect(screen.getByText('Reported title')).toBeInTheDocument()
    expect(screen.getByText('Reported post body')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide post' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open member view' })).toHaveAttribute('href', '/posts/p-1')
  })

  it('EvidencePanel renders a reported comment with parent post context', () => {
    const commentRow = {
      ...row,
      target_kind: 'comment',
      comment_id: 'cm-1',
      message_id: null,
      post: null,
      comment: {
        id: 'cm-1',
        content: 'Reported comment body',
        image_path: null,
        gif_url: null,
        author_id: 'u-1',
        author_display_name: 'Rio Mendez',
        post_id: 'p-1',
        post_title: null,
        post_snippet: 'Parent post body',
        moderation_status: 'approved',
        deleted_at: null,
        created_at: '2026-08-01T00:00:00Z',
      },
    } as unknown as ModerationCaseV2Row
    renderEvidence(
      <EvidencePanel
        data={commentRow}
        msg={null}
        canAct
        busy={false}
        hidePending={false}
        restorePending={false}
        onHide={() => {}}
        onRestore={() => {}}
      />,
    )
    expect(screen.getByText('Reported comment')).toBeInTheDocument()
    expect(screen.getByText('Reported comment body')).toBeInTheDocument()
    expect(screen.getByText(/Parent post body/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide comment' })).toBeInTheDocument()
  })

  it('EvidencePanel flags hidden and deleted content without actions', () => {
    const hiddenRow = {
      ...row,
      target_kind: 'post',
      post_id: 'p-1',
      message_id: null,
      post: {
        id: 'p-1',
        title: null,
        content: 'Gone post',
        image_path: null,
        gif_url: null,
        author_id: 'u-1',
        author_display_name: 'Rio Mendez',
        cluster_id: 'c-1',
        cluster_name: 'Aurora',
        moderation_status: 'rejected',
        deleted_at: '2026-08-02T00:00:00Z',
        created_at: '2026-08-01T00:00:00Z',
      },
      comment: null,
    } as unknown as ModerationCaseV2Row
    renderEvidence(
      <EvidencePanel
        data={hiddenRow}
        msg={null}
        canAct
        busy={false}
        hidePending={false}
        restorePending={false}
        onHide={() => {}}
        onRestore={() => {}}
      />,
    )
    expect(screen.getByText('Hidden')).toBeInTheDocument()
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide post' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore post' })).not.toBeInTheDocument()
  })

  it('TargetPanel flags active restrictions and roles', () => {
    render(
      <TargetPanel
        target={{
          id: 'u-1',
          display_name: 'Rio Mendez',
          account_status: 'suspended',
          restriction_expires_at: null,
          restriction_reason: 'spam wave',
          roles: ['moderator'],
          cluster_names: ['Aurora'],
          prior_reports: 2,
          prior_actions: 1,
        }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('spam wave')
    expect(screen.getByText('moderator')).toBeInTheDocument()
    expect(screen.getByText('Aurora')).toBeInTheDocument()
  })
})
