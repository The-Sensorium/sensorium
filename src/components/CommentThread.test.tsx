import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { CommentThread } from './CommentThread'
import type { PostComment } from '../features/posts'

vi.mock('../app/auth-context', () => ({ useAuth: vi.fn() }))
const avatarHook = vi.hoisted(() => vi.fn())
vi.mock('../features/avatars', () => ({
  useAvatarUrl: avatarHook,
  useAvatarThumbUrl: avatarHook,
  useAvatarFullUrl: avatarHook,
  avatarThumbFor: (s: string | null | undefined) => s ?? null,
  avatarFullFor: (s: string | null | undefined) => s ?? null,
}))
vi.mock('../features/posts', () => ({
  useClusterCommentLikes: vi.fn(),
  useCreateComment: vi.fn(),
  useToggleCommentLike: vi.fn(),
  useDeleteComment: vi.fn(),
  useEditComment: vi.fn(),
  uploadPostImage: vi.fn(),
  COMMENT_CONTENT_MAX: 500,
}))
vi.mock('../features/moderation', () => ({
  isMutedAuthor: () => false,
  mutedIds: () => new Set<string>(),
  toggleRevealedId: (prev: Set<string>, id: string) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  },
  useMyMutes: vi.fn(),
}))
vi.mock('./ReportModal', () => ({
  ReportModal: () => null,
}))
vi.mock('./PostMedia', () => ({ PostMedia: () => null }))
vi.mock('../pages/cluster/room/GifPicker', () => ({ GifPicker: () => null }))

import { useAuth } from '../app/auth-context'
import { useAvatarUrl } from '../features/avatars'
import { useClusterCommentLikes, useCreateComment, useDeleteComment, useEditComment, useToggleCommentLike } from '../features/posts'
import { useMyMutes } from '../features/moderation'

function commentFixture(overrides: Partial<PostComment> = {}): PostComment {
  return {
    id: 'c1',
    post_id: 'p1',
    author_id: 'u2',
    content: 'top comment',
    image_url: null,
    gif_url: null,
    parent_comment_id: null,
    deleted_at: null,
    moderation_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const MENTION_MEMBERS = [
  { id: 'u1', display_name: 'Titan', avatar_url: null },
  { id: 'u2', display_name: 'Page', avatar_url: null },
]

function setup(comments: PostComment[], deepLinkCommentId?: string, onDeepLinkHandled?: (id: string) => void) {
  vi.mocked(useAuth).mockReturnValue({ state: 'signedIn', userId: 'u1' } as never)
  vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
  vi.mocked(useCreateComment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  vi.mocked(useToggleCommentLike).mockReturnValue({ mutateAsync: vi.fn() } as never)
  vi.mocked(useDeleteComment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  vi.mocked(useEditComment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  vi.mocked(useClusterCommentLikes).mockReturnValue({ data: [] } as never)
  vi.mocked(useMyMutes).mockReturnValue({ data: [], isLoading: false } as never)
  const members = new Map([
    ['u1', { id: 'u1', display_name: 'Titan', avatar_url: null }],
    ['u2', { id: 'u2', display_name: 'Page', avatar_url: null }],
  ])
  return render(
    <MemoryRouter>
      <CommentThread
        clusterId="cl1"
        postId="p1"
        comments={comments}
        memberById={members as never}
        members={MENTION_MEMBERS}
        selfAvatar={{ display_name: 'Titan', avatar_url: null }}
        deepLinkCommentId={deepLinkCommentId}
        onDeepLinkHandled={onDeepLinkHandled}
      />
    </MemoryRouter>,
  )
}

describe('CommentThread reply placement', () => {
  it('renders the composer at the top when not replying', () => {
    setup([commentFixture()])
    const heading = screen.getByText(/Comments \(1\)/)
    const composer = screen.getByRole('combobox', { name: 'Add a comment' })
    expect(heading.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/Replying to/)).not.toBeInTheDocument()
  })

  it('moves the composer inline below the reply target when Reply is clicked', () => {
    const top = commentFixture({ id: 'c1', content: 'top comment' })
    const reply = commentFixture({ id: 'c2', content: 'nested reply', parent_comment_id: 'c1' })
    setup([top, reply])

    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0])
    expect(screen.getByText(/Replying to/)).toBeInTheDocument()

    const composer = screen.getByRole('combobox', { name: 'Add a comment' })
    const topContent = screen.getByText('top comment')
    const nestedContent = screen.getByText('nested reply')
    expect(topContent.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(composer.compareDocumentPosition(nestedContent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places the composer directly below a nested reply when replying to it', () => {
    const top = commentFixture({ id: 'c1', content: 'top comment' })
    const r1 = commentFixture({ id: 'c2', content: 'first reply', parent_comment_id: 'c1' })
    const r2 = commentFixture({ id: 'c3', content: 'second reply', parent_comment_id: 'c1' })
    setup([top, r1, r2])

    const replyButtons = screen.getAllByRole('button', { name: 'Reply' })
    fireEvent.click(replyButtons[1])

    const composer = screen.getByRole('combobox', { name: 'Add a comment' })
    const first = screen.getByText('first reply')
    const second = screen.getByText('second reply')
    expect(first.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(composer.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('CommentThread deep link', () => {
  it('anchors and highlights only the linked comment body', () => {
    const top = commentFixture({ id: 'c1', content: 'top comment' })
    const reply = commentFixture({ id: 'c2', content: 'nested reply', parent_comment_id: 'c1' })
    setup([top, reply], 'c2')
    const row = document.getElementById('comment-c2')
    expect(row).not.toBeNull()
    expect(row!.className).not.toContain('outline-primary')
    expect(row!.querySelector('.outline-primary')).not.toBeNull()
  })

  it('shows a fallback when the linked comment is missing', () => {
    setup([commentFixture({ id: 'c1' })], 'gone')
    expect(screen.getByText(/no longer available/)).toBeInTheDocument()
  })

  it('reports back once handled so the parent can clear the param', () => {
    const onHandled = vi.fn()
    setup([commentFixture({ id: 'c1' })], 'c1', onHandled)
    expect(onHandled).toHaveBeenCalledWith('c1')
  })

  it('fires again when a different comment is linked afterwards', () => {
    const top = commentFixture({ id: 'c1', content: 'top comment' })
    const reply = commentFixture({ id: 'c2', content: 'nested reply', parent_comment_id: 'c1' })
    const view = setup([top, reply], 'c1')
    expect(document.getElementById('comment-c1')!.querySelector('.outline-primary')).not.toBeNull()
    view.rerender(
      <MemoryRouter>
        <CommentThread
          clusterId="cl1"
          postId="p1"
          comments={[top, reply]}
          memberById={
            new Map([
              ['u1', { id: 'u1', display_name: 'Titan', avatar_url: null }],
              ['u2', { id: 'u2', display_name: 'Page', avatar_url: null }],
            ]) as never
          }
          members={MENTION_MEMBERS}
          selfAvatar={{ display_name: 'Titan', avatar_url: null }}
          deepLinkCommentId="c2"
        />
      </MemoryRouter>,
    )
    expect(document.getElementById('comment-c1')!.querySelector('.outline-primary')).toBeNull()
    expect(document.getElementById('comment-c2')!.querySelector('.outline-primary')).not.toBeNull()
  })
})

describe('CommentThread mentions', () => {
  it('shows the suggestion listbox while typing @ and inserts the picked member', async () => {
    setup([])
    const textarea = screen.getByRole('combobox', { name: 'Add a comment' })

    await userEvent.type(textarea, 'hey @Pa')
    expect(screen.getByRole('listbox', { name: 'Mention a member' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('option', { name: 'Page' }))
    await waitFor(() => expect(textarea).toHaveValue('hey @Page '))
    expect(screen.queryByRole('listbox', { name: 'Mention a member' })).not.toBeInTheDocument()
  })

  it('renders a mentioned name in a comment body as a profile link', () => {
    setup([commentFixture({ content: 'hey @Page, look' })])
    const link = screen.getByRole('link', { name: '@Page' })
    expect(link).toHaveAttribute('href', '/profile/u2?cluster=cl1')
  })
})
