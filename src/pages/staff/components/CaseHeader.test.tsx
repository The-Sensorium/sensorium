import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { CaseHeader } from './CaseHeader'
import type { ModerationCaseV2Row } from '../../../features/admin-moderation'

vi.mock('../../../features/notifications', () => ({
  timeAgo: () => 'just now',
}))

const baseRow = {
  id: 'r-1',
  cluster_id: 'c-1',
  cluster_name: 'Aurora',
  reason: 'spam',
  details: 'seed details',
  target_kind: 'member',
  message_id: null,
  post_id: null,
  comment_id: null,
  status: 'reviewing',
  severity: 'low',
  priority_score: 25,
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
  prior_reports: 0,
  reporter: null,
  target: { display_name: 'Rio Mendez' },
  target_user_id: 'u-1',
} as unknown as ModerationCaseV2Row

function renderHeader(overrides: Partial<ModerationCaseV2Row> = {}, extra: Record<string, unknown> = {}) {
  const noop = vi.fn()
  return render(
    <MemoryRouter>
      <CaseHeader
        onBack={noop}
        data={{ ...baseRow, ...overrides }}
        claimedByMe={false}
        open
        busy={false}
        claimPending={false}
        onClaim={noop}
        onRelease={noop}
        onDismiss={noop}
        {...extra}
      />
    </MemoryRouter>,
  )
}

describe('CaseHeader', () => {
  it('renders labeled status, severity, and target badges', () => {
    renderHeader()
    expect(screen.getByText('Status: Reviewing')).toBeInTheDocument()
    expect(screen.getByText('Severity: Low')).toBeInTheDocument()
    expect(screen.getByText('Target: Member')).toBeInTheDocument()
  })

  it('warns when another moderator holds the case', () => {
    renderHeader()
    expect(screen.getByRole('alert')).toHaveTextContent('Mara')
  })

  it('shows no stale warning when claimed by me', () => {
    renderHeader({}, { claimedByMe: true })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Release case' })).toBeInTheDocument()
  })

  it('offers claim for unassigned pending cases', () => {
    renderHeader({ status: 'pending', assigned_to: null, assigned_to_display_name: null } as Partial<ModerationCaseV2Row>)
    expect(screen.getByRole('button', { name: 'Claim case' })).toBeInTheDocument()
  })

  it('confirms before dismissing', () => {
    const onDismiss = vi.fn()
    renderHeader({}, { claimedByMe: true, onDismiss })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
