import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MyReportsPage } from './MyReportsPage'
import { useMyReports } from '../../features/moderation'

vi.mock('../../features/moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/moderation')>()
  return { ...actual, useMyReports: vi.fn() }
})

const useMyReportsMock = vi.mocked(useMyReports)

function renderPage() {
  return render(
    <MemoryRouter>
      <MyReportsPage />
    </MemoryRouter>,
  )
}

describe('MyReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state', () => {
    useMyReportsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false } as never)
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an error state', () => {
    useMyReportsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true } as never)
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load your reports.')
  })

  it('shows an empty state when there are no reports', () => {
    useMyReportsMock.mockReturnValue({ data: [], isLoading: false, isError: false } as never)
    renderPage()
    expect(screen.getByText('No reports yet. Reports you submit appear here.')).toBeInTheDocument()
  })

  it('lists reports with generic outcomes and no staff detail', () => {
    useMyReportsMock.mockReturnValue({
      data: [
        {
          id: 'r1',
          cluster_id: 'c1',
          cluster_name: 'Aurora',
          target_kind: 'member',
          target_display_name: 'Bo',
          reason: 'spam',
          details: 'kept pinging me',
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        {
          id: 'r2',
          cluster_id: 'c1',
          cluster_name: 'Aurora',
          target_kind: 'post',
          target_display_name: 'Cy',
          reason: 'harassment',
          details: null,
          status: 'actioned',
          created_at: new Date().toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    } as never)
    renderPage()
    expect(document.querySelectorAll('[data-e2e="my-report-row"]')).toHaveLength(2)
    expect(screen.getByText('Reviewed — action taken.')).toBeInTheDocument()
    expect(screen.getByText('Bo · Member')).toBeInTheDocument()
    expect(screen.getByText('“kept pinging me”')).toBeInTheDocument()
  })

  it('falls back to a kind label when the target account is gone', () => {
    useMyReportsMock.mockReturnValue({
      data: [
        {
          id: 'r3',
          cluster_id: 'c1',
          cluster_name: 'Aurora',
          target_kind: 'member',
          target_display_name: null,
          reason: 'spam',
          details: null,
          status: 'dismissed',
          created_at: new Date().toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    } as never)
    renderPage()
    expect(screen.getByText('Member report')).toBeInTheDocument()
  })
})
