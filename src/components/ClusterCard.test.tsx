import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ClusterCard } from './ClusterCard'
import type { MyCluster } from '../features/matching'

function makeCluster(overrides: Partial<MyCluster['cluster']> = {}): MyCluster {
  return {
    cluster: {
      id: 'c1',
      name: 'My Cluster',
      matching_mode: 'generation',
      status: 'active',
      introductions_completed_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      ...overrides,
    } as MyCluster['cluster'],
    joinedAt: '2026-01-01T00:00:00Z',
    memberCount: 8,
  }
}

describe('ClusterCard', () => {
  it('renders the cluster name, mode, and member count', () => {
    render(
      <MemoryRouter>
        <ClusterCard item={makeCluster()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('My Cluster')).toBeInTheDocument()
    expect(screen.getByText('Generation')).toBeInTheDocument()
    expect(screen.getByText('8 members')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('links into the cluster detail route for active clusters', () => {
    render(
      <MemoryRouter>
        <ClusterCard item={makeCluster()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /My Cluster/ })).toHaveAttribute(
      'href',
      '/cluster/c1',
    )
  })

  it('links into the cluster detail route even when introductions are pending', () => {
    const item = makeCluster({
      status: 'introductions',
      introductions_completed_at: null,
    })
    render(
      <MemoryRouter>
        <ClusterCard item={item} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /My Cluster/ })).toHaveAttribute(
      'href',
      '/cluster/c1',
    )
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('prompts personal action when the caller has not answered', () => {
    const item = makeCluster({
      status: 'active',
      introductions_completed_at: '2026-01-02T00:00:00Z',
    })
    render(
      <MemoryRouter>
        <ClusterCard item={item} myIntroCompletedAt={null} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Complete your introductions/)).toBeInTheDocument()
  })

  it('shows no waiting state once the caller has answered', () => {
    const item = makeCluster({
      status: 'active',
      introductions_completed_at: '2026-01-02T00:00:00Z',
    })
    render(
      <MemoryRouter>
        <ClusterCard item={item} myIntroCompletedAt="2026-01-02T00:00:00Z" />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/Waiting for the others/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Complete your introductions/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /My Cluster/ })).toHaveAttribute(
      'href',
      '/cluster/c1',
    )
  })

  it('labels archived clusters', () => {
    render(
      <MemoryRouter>
        <ClusterCard item={makeCluster({ status: 'archived' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('hides the unread badge when there is nothing unread', () => {
    const { container } = render(
      <MemoryRouter>
        <ClusterCard item={makeCluster()} unreadCount={0} />
      </MemoryRouter>,
    )
    expect(container.querySelector('[data-e2e="cluster-unread-badge-c1"]')).toBeNull()
  })

  it('shows the unread badge with the cluster count', () => {
    const { container } = render(
      <MemoryRouter>
        <ClusterCard item={makeCluster()} unreadCount={3} />
      </MemoryRouter>,
    )
    expect(container.querySelector('[data-e2e="cluster-unread-badge-c1"]')).not.toBeNull()
    expect(screen.getByLabelText('3 unread messages')).toBeInTheDocument()
  })

  it('caps a large unread count at 9+', () => {
    render(
      <MemoryRouter>
        <ClusterCard item={makeCluster()} unreadCount={42} />
      </MemoryRouter>,
    )
    expect(screen.getByText('9+')).toBeInTheDocument()
    expect(screen.getByLabelText('42 unread messages')).toBeInTheDocument()
  })

  it('keeps the status row stable with and without unread', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <ClusterCard item={makeCluster()} unreadCount={0} />
      </MemoryRouter>,
    )
    const row = container.querySelector('p.text-on-surface-variant')?.parentElement
    expect(row).not.toBeNull()
    expect(screen.getByText('Active')).toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <ClusterCard item={makeCluster()} unreadCount={3} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Active').parentElement).toBe(row)
  })
})
