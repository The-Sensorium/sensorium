import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MembersView } from './MembersView'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClusterMembers: vi.fn(),
  useReplacementRound: vi.fn(),
  usePresence: vi.fn(),
  useAvatarUrl: vi.fn(),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useParams: () => ({ clusterId: 'c1' }) }
})
vi.mock('../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../features/matching', () => ({ useClusterMembers: hooks.useClusterMembers }))
vi.mock('../../features/votes', () => ({ useReplacementRound: hooks.useReplacementRound }))
vi.mock('../../features/realtime', () => ({ usePresence: hooks.usePresence }))
vi.mock('../../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl }))

const member = {
  id: 'm1',
  display_name: 'Bo',
  avatar_url: null,
  country_code: 'US',
  birth_year: 1990,
  current_status: 'Deep in a book',
  availability: 'available',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MembersView />
    </MemoryRouter>,
  )
}

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false }
}

describe('MembersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1' })
    hooks.useClusterMembers.mockReturnValue(queryStub([member]))
    hooks.useReplacementRound.mockReturnValue(queryStub(null))
    hooks.usePresence.mockReturnValue({ online: new Set() })
    hooks.useAvatarUrl.mockReturnValue({ data: undefined })
  })

  it('shows the loading state while members load', () => {
    hooks.useClusterMembers.mockReturnValue({ data: [], isLoading: true, isError: false })
    renderPage()
    expect(screen.getByText('Loading members…')).toBeInTheDocument()
  })

  it('shows an empty state when there are no members', () => {
    hooks.useClusterMembers.mockReturnValue(queryStub([]))
    renderPage()
    expect(screen.getByText('No members yet.')).toBeInTheDocument()
  })

  it('renders member details and country', () => {
    renderPage()
    expect(screen.getByText('Bo')).toBeInTheDocument()
    expect(screen.getByText('United States')).toBeInTheDocument()
    expect(screen.getByText('1990')).toBeInTheDocument()
    expect(screen.getByText('“Deep in a book”')).toBeInTheDocument()
  })

  it('shows the availability badge for online members', () => {
    hooks.usePresence.mockReturnValue({ online: new Set(['m1']) })
    renderPage()
    expect(screen.getAllByText('Available').length).toBeGreaterThan(0)
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })

  it('shows Offline for members not in the presence set', () => {
    renderPage()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.queryByText('Available')).not.toBeInTheDocument()
  })

  it('shows the replacement banner when a spot is open', () => {
    hooks.useReplacementRound.mockReturnValue(queryStub({ id: 'r1' }))
    renderPage()
    expect(screen.getByText('A spot just opened')).toBeInTheDocument()
    expect(screen.getByText("We're 1 of 8, finding a new member.")).toBeInTheDocument()
  })
})
