import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SignalRow } from './SignalRow'
import type { Signal } from '../../../features/signals'

const signal: Signal = {
  id: 's1',
  cluster_id: 'c1',
  author_id: 'a1',
  prompt: 'Need help with onboarding',
  status: 'open',
  created_at: '2026-01-01T12:00:00Z',
  resolved_at: null,
  resolved_by: null,
}

function setup(overrides: Partial<Parameters<typeof SignalRow>[0]> = {}) {
  render(
    <MemoryRouter>
      <SignalRow
        signal={signal}
        author={{ display_name: 'Alice Blue', avatar_url: null }}
        isMine={false}
        replyCount={2}
        clusterId="c1"
        showDay={false}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('SignalRow', () => {
  it('renders the prompt, author, status, and reply count', () => {
    setup()
    expect(screen.getByText('Need help with onboarding')).toBeInTheDocument()
    expect(screen.getByText(/Alice Blue/)).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText(/2 replies/)).toBeInTheDocument()
  })

  it('labels the author when the signal is mine', () => {
    setup({ isMine: true })
    expect(screen.getByText(/(you)/)).toBeInTheDocument()
  })

  it('links to the signal detail route', () => {
    setup()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/cluster/c1/signals/s1')
  })

  it('renders the day divider when showDay is set', () => {
    setup({ showDay: true })
    expect(screen.getByText(/^\w+, 1 Jan$/)).toBeInTheDocument()
  })
})