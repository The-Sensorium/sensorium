import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { IntroChecklistBanner } from './IntroChecklistBanner'

const hooks = vi.hoisted(() => ({
  useMyMembership: vi.fn(),
  useIntroProgress: vi.fn(),
}))

vi.mock('../features/introductions', () => ({
  useMyMembership: hooks.useMyMembership,
  useIntroProgress: hooks.useIntroProgress,
}))

function renderBanner() {
  return render(
    <MemoryRouter>
      <IntroChecklistBanner clusterId="c1" />
    </MemoryRouter>,
  )
}

describe('IntroChecklistBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    hooks.useIntroProgress.mockReturnValue({
      data: [
        { user_id: 'u1', display_name: 'A', intro_completed_at: null },
        { user_id: 'u2', display_name: 'B', intro_completed_at: '2026-01-02T00:00:00Z' },
      ],
      isLoading: false,
    })
  })

  it('renders the nudge with progress while the viewer has not answered', () => {
    hooks.useMyMembership.mockReturnValue({
      data: { intro_completed_at: null },
      isLoading: false,
    })
    renderBanner()
    expect(screen.getByText('Complete your introductions')).toBeInTheDocument()
    expect(screen.getByText(/1 of 2 members finished/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Answer' })).toHaveAttribute(
      'href',
      '/cluster/c1/introductions',
    )
  })

  it('renders nothing once the viewer has answered', () => {
    hooks.useMyMembership.mockReturnValue({
      data: { intro_completed_at: '2026-01-02T00:00:00Z' },
      isLoading: false,
    })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('dismisses and stays dismissed', () => {
    hooks.useMyMembership.mockReturnValue({
      data: { intro_completed_at: null },
      isLoading: false,
    })
    const { container } = renderBanner()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss introductions reminder' }))
    expect(container).toBeEmptyDOMElement()
    expect(window.localStorage.getItem('intro-nudge-dismissed:c1')).toBe('1')
  })

  it('persistent variant has no dismiss button and ignores stored dismissal', () => {
    hooks.useMyMembership.mockReturnValue({
      data: { intro_completed_at: null },
      isLoading: false,
    })
    window.localStorage.setItem('intro-nudge-dismissed:c1', '1')
    render(
      <MemoryRouter>
        <IntroChecklistBanner clusterId="c1" dismissible={false} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Complete your introductions')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Dismiss introductions reminder' }),
    ).not.toBeInTheDocument()
  })
})
