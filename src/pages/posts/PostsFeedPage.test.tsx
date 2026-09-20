import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PostsFeedPage } from './PostsFeedPage'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useMyClusters: vi.fn(),
  useClusterMembers: vi.fn(),
  useClusterPosts: vi.fn(),
  usePostCounts: vi.fn(),
  useClusterPostLikes: vi.fn(),
  useTogglePostLike: vi.fn(),
  useLoadEarlierPosts: vi.fn(),
  useClusterChannel: vi.fn(),
  useMyMutes: vi.fn(),
}))

vi.mock('../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../features/matching', () => ({
  useMyClusters: hooks.useMyClusters,
  useClusterMembers: hooks.useClusterMembers,
}))
vi.mock('../../features/posts', () => ({
  useClusterPosts: hooks.useClusterPosts,
  usePostCounts: hooks.usePostCounts,
  useClusterPostLikes: hooks.useClusterPostLikes,
  useTogglePostLike: hooks.useTogglePostLike,
  useLoadEarlierPosts: hooks.useLoadEarlierPosts,
  POSTS_PAGE_SIZE: 30,
  sortPostsForFeed: (posts: unknown[]) => posts,
}))
vi.mock('../../features/realtime', () => ({ useClusterChannel: hooks.useClusterChannel }))
vi.mock('../../features/moderation', () => ({
  useMyMutes: hooks.useMyMutes,
  mutedIds: () => new Set<string>(),
  isMutedAuthor: () => false,
  toggleRevealedId: (prev: Set<string>) => prev,
}))
vi.mock('../../components/PostComposer', () => ({
  PostComposer: () => <div data-testid="post-composer" />,
}))

const locked = {
  cluster: { id: 'locked1', name: 'Drift', introductions_completed_at: null },
  joinedAt: '2026-01-01T00:00:00Z',
  memberCount: 8,
}
const unlocked = {
  cluster: { id: 'unlocked1', name: 'Aurora', introductions_completed_at: '2026-01-01T00:00:00Z' },
  joinedAt: '2026-01-01T00:00:00Z',
  memberCount: 8,
}

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false, refetch: vi.fn() }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PostsFeedPage />
    </MemoryRouter>,
  )
}

describe('PostsFeedPage introductions lock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1' })
    hooks.useMyClusters.mockReturnValue(queryStub([locked, unlocked]))
    hooks.useClusterMembers.mockReturnValue(queryStub([]))
    hooks.useClusterPosts.mockReturnValue(queryStub([]))
    hooks.usePostCounts.mockReturnValue(queryStub([]))
    hooks.useClusterPostLikes.mockReturnValue(queryStub([]))
    hooks.useTogglePostLike.mockReturnValue({ mutateAsync: vi.fn() })
    hooks.useLoadEarlierPosts.mockReturnValue({ mutate: vi.fn(), isPending: false, data: undefined })
    hooks.useMyMutes.mockReturnValue(queryStub([]))
  })

  it('hides the composer and shows the lock notice for a locked cluster', () => {
    renderPage()
    expect(screen.getByText(/Posts unlock after introductions/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Complete your introductions' })).toHaveAttribute(
      'href',
      '/cluster/locked1/waiting',
    )
    expect(screen.queryByTestId('post-composer')).not.toBeInTheDocument()
    expect(screen.queryByText(/Share the first one/)).not.toBeInTheDocument()
  })

  it('shows the composer once an unlocked cluster is selected', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Aurora' }))
    expect(screen.getByTestId('post-composer')).toBeInTheDocument()
    expect(screen.getByText('No posts in Aurora yet. Share the first one.')).toBeInTheDocument()
    expect(screen.queryByText(/Posts unlock after introductions/)).not.toBeInTheDocument()
  })
})
