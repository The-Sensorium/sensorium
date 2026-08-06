import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PublicClusterCard } from './PublicClusterCard'
import type { ClusterTile } from '../features/discovery'

function makeCluster(overrides: Partial<ClusterTile> = {}): ClusterTile {
  return {
    id: 'c1',
    name: 'The Night Owls',
    matching_mode: 'birth_month',
    mode_label: 'Birth Month',
    status: 'active',
    member_count: 8,
    created_at: '2024-06-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('PublicClusterCard', () => {
  it('renders public metadata for a non-member', () => {
    render(
      <MemoryRouter>
        <PublicClusterCard cluster={makeCluster()} isMember={false} />
      </MemoryRouter>,
    )
    expect(screen.getByText('The Night Owls')).toBeInTheDocument()
    expect(screen.getByText('Birth Month')).toBeInTheDocument()
    expect(screen.getByText('8 members')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/Formed/)).toBeInTheDocument()
  })

  it('does not link when the viewer is not a member', () => {
    render(
      <MemoryRouter>
        <PublicClusterCard cluster={makeCluster()} isMember={false} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('links to the room when the viewer is a member', () => {
    render(
      <MemoryRouter>
        <PublicClusterCard cluster={makeCluster()} isMember={true} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /The Night Owls/ })).toHaveAttribute(
      'href',
      '/cluster/c1',
    )
  })

  it('labels clusters mid-introductions', () => {
    render(
      <MemoryRouter>
        <PublicClusterCard cluster={makeCluster({ status: 'introductions' })} isMember={false} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Introductions in progress')).toBeInTheDocument()
  })

  it('labels archived clusters', () => {
    render(
      <MemoryRouter>
        <PublicClusterCard cluster={makeCluster({ status: 'archived' })} isMember={false} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })
})