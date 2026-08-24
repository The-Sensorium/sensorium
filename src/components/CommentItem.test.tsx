import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentItem } from './CommentItem'
import type { PostComment } from '../features/posts'

vi.mock('../features/posts', () => ({
  useDeleteComment: vi.fn(),
}))
vi.mock('../features/avatars', () => ({ useAvatarUrl: vi.fn() }))
vi.mock('../app/auth-context', () => ({ useAuth: vi.fn() }))
vi.mock('./ReportModal', () => ({
  ReportModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="report-modal">Report</div> : null,
}))
vi.mock('./PostMedia', () => ({ PostMedia: () => null }))

import { useAuth } from '../app/auth-context'
import { useAvatarUrl } from '../features/avatars'
import { useDeleteComment } from '../features/posts'

function fixture(overrides: Partial<PostComment> = {}): PostComment {
  return {
    id: 'x1',
    post_id: 'p1',
    author_id: 'u2',
    content: 'a reply',
    image_url: null,
    gif_url: null,
    parent_comment_id: 'c0',
    deleted_at: null,
    moderation_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function setup(overrides: Partial<PostComment> = {}, opts: { onReply?: (c: PostComment) => void } = {}) {
  const comment = fixture(overrides)
  vi.mocked(useAuth).mockReturnValue({ state: 'signedIn', userId: 'u1' } as never)
  vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
  vi.mocked(useDeleteComment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  const onReply = opts.onReply ?? vi.fn()
  render(
    <CommentItem
      comment={comment}
      clusterId="c1"
      author={{ id: comment.author_id, display_name: 'Rio', avatar_url: null }}
      repliedToName={comment.parent_comment_id ? 'Diya' : undefined}
      onReply={onReply}
    />,
  )
  return { onReply }
}

describe('CommentItem', () => {
  it('shows the author and the reply content', () => {
    setup()
    expect(screen.getByText('Rio')).toBeInTheDocument()
    expect(screen.getByText('a reply')).toBeInTheDocument()
  })

  it('prefixes the replied-to person’s name', () => {
    setup()
    expect(screen.getByText('@Diya')).toBeInTheDocument()
  })

  it('omits the prefix when there is no reply target', () => {
    setup({ parent_comment_id: null })
    expect(screen.queryByText('@Diya')).not.toBeInTheDocument()
  })

  it('invokes onReply with the comment', () => {
    const { onReply } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    const comment = fixture()
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'x1' }))
    void comment
  })

  it('offers Report (not Delete) on another author’s comment', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Report comment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete comment' })).not.toBeInTheDocument()
  })

  it('shows a like count and a reply count', () => {
    const comment = fixture()
    vi.mocked(useAuth).mockReturnValue({ state: 'signedIn', userId: 'u1' } as never)
    vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
    vi.mocked(useDeleteComment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    render(
      <CommentItem
        comment={comment}
        clusterId="c1"
        author={{ id: comment.author_id, display_name: 'Rio', avatar_url: null }}
        onLike={vi.fn()}
        likeCount={4}
        likedByMe
        replyCount={2}
      />,
    )
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('invokes onLike when the heart is clicked', () => {
    const comment = fixture()
    const onLike = vi.fn()
    vi.mocked(useAuth).mockReturnValue({ state: 'signedIn', userId: 'u1' } as never)
    vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
    vi.mocked(useDeleteComment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    render(
      <CommentItem
        comment={comment}
        clusterId="c1"
        author={{ id: comment.author_id, display_name: 'Rio', avatar_url: null }}
        onLike={onLike}
        likeCount={1}
        likedByMe
      />,
    )
    fireEvent.click(screen.getByRole('button', { pressed: true }))
    expect(onLike).toHaveBeenCalledWith('x1')
  })
})
