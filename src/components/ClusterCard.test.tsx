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
      matching_mode: 'birth_month',
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
    expect(screen.getByText('Birth Month')).toBeInTheDocument()
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

  it('links to introductions when introductions are pending', () => {
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
      '/cluster/c1/introductions',
    )
    expect(screen.getByText('Introductions in progress')).toBeInTheDocument()
  })

  it('labels completed introductions', () => {
    const item = makeCluster({
      status: 'introductions',
      introductions_completed_at: '2026-01-02T00:00:00Z',
    })
    render(
      <MemoryRouter>
        <ClusterCard item={item} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Introductions complete')).toBeInTheDocument()
  })

  it('labels archived clusters', () => {
    render(
      <MemoryRouter>
        <ClusterCard item={makeCluster({ status: 'archived' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })
})
