import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { VoteRow } from './VoteRow'
import type { Vote } from '../../../features/votes'

const vote: Vote = {
  id: 'v1',
  cluster_id: 'c1',
  initiated_by: 'a1',
  type: 'change_name',
  name_suggestion: 'Beacon',
  target_member_id: null,
  status: 'open',
  result: null,
  created_at: '2026-01-01T12:00:00Z',
  closes_at: new Date(Date.now() + 86_400_000).toISOString(),
}

function setup(overrides: Partial<Parameters<typeof VoteRow>[0]> = {}) {
  render(
    <MemoryRouter>
      <VoteRow
        vote={vote}
        initiator={{ display_name: 'Alice Blue', avatar_url: null }}
        target={undefined}
        isMine={false}
        clusterId="c1"
        showDay={false}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('VoteRow', () => {
  it('renders the vote title with its suggestion', () => {
    setup()
    expect(screen.getByText('Rename the cluster: Rename to "Beacon"')).toBeInTheDocument()
  })

  it('links to the votes route', () => {
    setup()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/cluster/c1/votes')
  })

  it('shows a countdown for the deadline', () => {
    setup()
    expect(screen.getByText(/Ends in/)).toBeInTheDocument()
  })
})