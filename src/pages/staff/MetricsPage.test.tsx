import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MetricsPage } from './MetricsPage'

const hooks = vi.hoisted(() => ({
  useMetricsOverview: vi.fn(),
  useRetention: vi.fn(),
  useModeBreakdown: vi.fn(),
  useClusterActivity: vi.fn(),
}))

vi.mock('../../features/metrics', () => ({
  useMetricsOverview: hooks.useMetricsOverview,
  useRetention: hooks.useRetention,
  useModeBreakdown: hooks.useModeBreakdown,
  useClusterActivity: hooks.useClusterActivity,
  DEFAULT_ACTIVITY_LIMIT: 50,
}))

function ok<T>(data: T) {
  return { data, isLoading: false, isError: false, refetch: vi.fn() }
}

function loading() {
  return { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }
}

function failing() {
  return { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
}

const overview = {
  total_clusters: 3,
  active_clusters: 2,
  daily_active_clusters: 1,
  messages_30d: 42,
  avg_clusters_per_user: 1.5,
  data_through_day: '2026-09-20',
  last_rollup_at: new Date(Date.now() - 3600_000).toISOString(),
}

const retention = [{ cohort_days: 30, formed: 2, retained: 1, rate: 0.5 }]

const modes = [
  {
    mode: 'generation',
    clusters_formed: 1,
    queue_joins: 5,
    avg_queue_depth: 2.5,
    max_oldest_wait_hours: 9,
    active_clusters: 1,
    avg_messages_per_cluster: 30,
  },
]

const activity = [
  {
    cluster_id: 'c1',
    name: 'Night Owls',
    mode: 'generation',
    active_members: 8,
    messages_30d: 40,
    last_message_day: '2026-09-01',
  },
]

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <MetricsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MetricsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useMetricsOverview.mockReturnValue(ok(overview))
    hooks.useRetention.mockReturnValue(ok(retention))
    hooks.useModeBreakdown.mockReturnValue(ok(modes))
    hooks.useClusterActivity.mockReturnValue(ok(activity))
  })

  it('renders overview cards, retention, modes, and activity', () => {
    renderPage()
    expect(screen.getByText('Metrics')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('30-day')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getAllByText('Generation')).toHaveLength(2)
    expect(screen.getByText('Night Owls')).toBeInTheDocument()
  })

  it('explains the retention definition and join counting', () => {
    renderPage()
    expect(screen.getAllByText(/at least 6 members/)).toHaveLength(1)
    expect(screen.getAllByText(/rejoining counts again/)).toHaveLength(1)
  })

  it('shows loading states per section', () => {
    hooks.useMetricsOverview.mockReturnValue(loading())
    hooks.useRetention.mockReturnValue(loading())
    hooks.useModeBreakdown.mockReturnValue(loading())
    hooks.useClusterActivity.mockReturnValue(loading())
    renderPage()
    expect(screen.getByText('Metrics')).toBeInTheDocument()
    expect(screen.queryByText('Night Owls')).not.toBeInTheDocument()
  })

  it('shows error states with retry', () => {
    hooks.useMetricsOverview.mockReturnValue(failing())
    hooks.useModeBreakdown.mockReturnValue(failing())
    renderPage()
    expect(screen.getByText('Couldn’t load overview.')).toBeInTheDocument()
    expect(screen.getByText('Couldn’t load mode breakdown.')).toBeInTheDocument()
  })

  it('shows an empty state when no cohorts qualify yet', () => {
    hooks.useRetention.mockReturnValue(ok([]))
    renderPage()
    expect(screen.getByText(/No cohorts old enough yet/)).toBeInTheDocument()
  })

  it('shows an empty state when no clusters are active', () => {
    hooks.useClusterActivity.mockReturnValue(ok([]))
    renderPage()
    expect(screen.getByText('No active clusters yet.')).toBeInTheDocument()
  })

  it('shows the concrete date window and measured freshness', () => {
    renderPage()
    expect(screen.getByText(/Updated 1 hour ago/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh data' })).toBeInTheDocument()
  })

  it('confirms a manual refresh with Updated just now', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    expect(await screen.findByText(/Updated just now/, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('says plainly when the rollup has never run', () => {
    hooks.useMetricsOverview.mockReturnValue(
      ok({ ...overview, last_rollup_at: null, data_through_day: null }),
    )
    renderPage()
    expect(screen.getByText(/Awaiting first rollup/)).toBeInTheDocument()
  })

  it('falls back to the data-through date without a rollup timestamp', () => {
    hooks.useMetricsOverview.mockReturnValue(
      ok({ ...overview, last_rollup_at: null, data_through_day: '2026-09-20' }),
    )
    renderPage()
    const expected = new Date('2026-09-20T00:00:00Z').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' && (element?.textContent?.includes(`Data through ${expected}`) ?? false),
      ),
    ).toBeInTheDocument()
  })

  it('shows how many clusters are listed and hides Show more below the limit', () => {
    renderPage()
    expect(screen.getByText('Showing top 1 active cluster')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('explains unclear columns with info tips', () => {
    renderPage()
    expect(
      screen.getByRole('button', { name: 'What is average queue depth?' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Mean number of people waiting/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'What does joins count?' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Still active with at least 6 members/)).toBeInTheDocument()
  })

  it('falls back to the raw value for an unknown mode instead of crashing', () => {
    hooks.useModeBreakdown.mockReturnValue(
      ok([
        {
          mode: 'future_mode',
          clusters_formed: 0,
          queue_joins: 0,
          avg_queue_depth: 0,
          max_oldest_wait_hours: 0,
          active_clusters: 0,
          avg_messages_per_cluster: 0,
        },
      ]),
    )
    renderPage()
    expect(screen.getByText('future_mode')).toBeInTheDocument()
  })

  it('never renders a 24h remainder in wait times', () => {
    hooks.useModeBreakdown.mockReturnValue(
      ok([{ ...modes[0], max_oldest_wait_hours: 47.9 }]),
    )
    renderPage()
    expect(screen.queryByText('1d 24h')).not.toBeInTheDocument()
    expect(screen.getByText('2d')).toBeInTheDocument()
  })

  it('requests a larger page when Show more is clicked', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ ...activity[0], cluster_id: `c${i}` }))
    hooks.useClusterActivity.mockReturnValue(ok(rows))
    renderPage()
    expect(screen.getByText('Showing top 50 active clusters')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(hooks.useClusterActivity).toHaveBeenLastCalledWith(100)
  })
})
