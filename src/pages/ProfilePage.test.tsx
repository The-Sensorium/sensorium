import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ProfilePage } from './ProfilePage'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClusterMembers: vi.fn(),
  useMyClusters: vi.fn(),
  usePresence: vi.fn(),
  useMemberIntroAnswers: vi.fn(),
  useIntroQuestionMap: vi.fn(),
  useUserPosts: vi.fn(),
  usePostCountsForClusters: vi.fn(),
  useAvatarUrl: vi.fn(),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useParams: () => ({ userId: 'm1' }),
    useSearchParams: () => [new URLSearchParams('cluster=c1')],
  }
})
vi.mock('../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../features/matching', () => ({
  useClusterMembers: hooks.useClusterMembers,
  useMyClusters: hooks.useMyClusters,
}))
vi.mock('../features/realtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/realtime')>()
  return { ...actual, usePresence: hooks.usePresence }
})
vi.mock('../features/cluster', () => ({
  useMemberIntroAnswers: hooks.useMemberIntroAnswers,
  useIntroQuestionMap: hooks.useIntroQuestionMap,
}))
vi.mock('../features/posts', () => ({
  useUserPosts: hooks.useUserPosts,
  usePostCountsForClusters: hooks.usePostCountsForClusters,
}))
vi.mock('../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl }))
vi.mock('../components/ReportModal', () => ({ ReportModal: () => null }))
vi.mock('../components/MuteButton', () => ({ MuteButton: () => null }))

const member = {
  id: 'm1',
  display_name: 'Amelia Chen',
  avatar_url: null,
  country_code: 'US',
  birth_year: 1990,
  current_status: 'Deep in a book',
  manual_status: 'away',
  pronouns: 'she/her',
  timezone: 'America/New_York',
  bio: 'I am a writer who collects postcards and small radios. I believe in slow mornings, handwritten letters, and the kind of friendship that survives a decade of silence. This is a long bio so it would previously have been clamped.',
}

const clusterRow = { cluster: { id: 'c1', name: 'Aurora' }, memberCount: 8 }

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1' })
    hooks.useClusterMembers.mockReturnValue(queryStub([member]))
    hooks.useMyClusters.mockReturnValue(queryStub([clusterRow]))
    hooks.usePresence.mockReturnValue({ online: new Set() })
    hooks.useMemberIntroAnswers.mockReturnValue(queryStub([]))
    hooks.useIntroQuestionMap.mockReturnValue({ data: new Map() })
    hooks.useUserPosts.mockReturnValue(queryStub([]))
    hooks.usePostCountsForClusters.mockReturnValue(queryStub([]))
    hooks.useAvatarUrl.mockReturnValue({ data: undefined })
  })

  it('shows the loading state while members load', () => {
    hooks.useClusterMembers.mockReturnValue({ data: [], isLoading: true, isError: false })
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders header meta with country and local time, but no birth year', () => {
    renderPage()
    expect(screen.getByText('Amelia Chen')).toBeInTheDocument()
    expect(screen.getByText('she/her')).toBeInTheDocument()
    expect(screen.getByText('United States')).toBeInTheDocument()
    expect(screen.getByText(/\d{1,2}:\d{2} (AM|PM)/)).toBeInTheDocument()
    expect(screen.getAllByText('1990')).toHaveLength(1)
  })

  it('renders the status as italic text without a Status heading', () => {
    renderPage()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
    expect(screen.getByText('Deep in a book')).toBeInTheDocument()
  })

  it('shows the manual status pill when actually online', () => {
    hooks.usePresence.mockReturnValue({ online: new Set(['m1']) })
    renderPage()
    expect(screen.getByText('Away', { selector: 'span:not(.sr-only)' })).toBeInTheDocument()
  })

  it('shows offline on the detail header when not actually online', () => {
    renderPage()
    expect(screen.getByText('Offline', { selector: 'span:not(.sr-only)' })).toBeInTheDocument()
    expect(screen.queryByText('Away', { selector: 'span:not(.sr-only)' })).not.toBeInTheDocument()
  })

  it('orders sections as Details, About, Introductions', () => {
    const { container } = renderPage()
    const labels = [...container.querySelectorAll('section[aria-label]')].map(
      (el) => el.getAttribute('aria-label'),
    )
    expect(labels).toEqual(['Details', 'About', 'Introductions'])
  })

  it('renders the full bio with quote marks and no expand toggle', () => {
    const { container } = renderPage()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText(member.bio)).toBeInTheDocument()
    expect(screen.getByText('“')).toBeInTheDocument()
    expect(screen.getByText('”')).toBeInTheDocument()
    expect(screen.queryByText('Show more')).not.toBeInTheDocument()
    expect(screen.queryByText('Show less')).not.toBeInTheDocument()
    expect(container.querySelector('.line-clamp-3')).toBeNull()
  })

  it('hides the About card when there is no bio', () => {
    hooks.useClusterMembers.mockReturnValue(queryStub([{ ...member, bio: null }]))
    renderPage()
    expect(screen.queryByText('About')).not.toBeInTheDocument()
  })

  it('shows birth year and cluster name side by side in the Details card', () => {
    renderPage()
    const details = screen.getByLabelText('Details')
    expect(within(details).getByText('1990')).toBeInTheDocument()
    expect(within(details).getByText('Aurora')).toBeInTheDocument()
    expect(within(details).queryByText(/years? old/)).not.toBeInTheDocument()
    expect(within(details).queryByText(/members/)).not.toBeInTheDocument()
  })

  it('hides the time and its dividers when the timezone is invalid', () => {
    hooks.useClusterMembers.mockReturnValue(queryStub([{ ...member, timezone: 'Not/AZone' }]))
    const { container } = renderPage()
    expect(screen.getByText('United States')).toBeInTheDocument()
    expect(screen.queryByText(/\d{1,2}:\d{2} (AM|PM)/)).not.toBeInTheDocument()
    expect(screen.queryByText('Local time:')).not.toBeInTheDocument()
    expect(container.querySelectorAll('span.w-px')).toHaveLength(1)
  })

  it('renders the Details card full width when only the cluster is present', () => {
    hooks.useClusterMembers.mockReturnValue(queryStub([{ ...member, birth_year: null }]))
    renderPage()
    const details = screen.getByLabelText('Details')
    expect(within(details).queryByText('Born')).not.toBeInTheDocument()
    expect(within(details).getByText('Aurora')).toBeInTheDocument()
    expect(within(details).getByText('Aurora')).toHaveAttribute('title', 'Aurora')
  })

  it('offers Message, Mute, and Report below the header for another member', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Message Amelia Chen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
  })

  it('offers Edit profile for the self view', () => {
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'm1' })
    renderPage()
    expect(screen.getByRole('link', { name: 'Edit profile' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Message Amelia Chen' })).not.toBeInTheDocument()
  })
})