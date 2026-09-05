import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, asError, type MockSupabaseResult } from '../test/supabase-client'
import {
  COMMENT_CONTENT_MAX,
  POSTS_PAGE_SIZE,
  postImageStoragePath,
  sortPostsForFeed,
  useClusterPostComments,
  useClusterPostLikes,
  useClusterPosts,
  useClusterCommentLikes,
  useCreateComment,
  useCreatePost,
  useDeleteComment,
  useDeletePost,
  useEditPost,
  useLoadEarlierPosts,
  usePost,
  usePostComments,
  usePostLikes,
  useRecentClusterPosts,
  usePostImageUrl,
  useReportComment,
  useReportPost,
  useToggleCommentLike,
  useTogglePostLike,
  useUserPosts,
  type Post,
} from './posts'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))
vi.mock('../app/auth-context', () => ({ useAuth: vi.fn() }))

const requireSupabaseMock = vi.mocked(requireSupabase)
const useAuthMock = vi.mocked(useAuth)

let mockResult: { value: MockSupabaseResult }
let queryClient: QueryClient

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrapper({ children }: { children?: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('posts', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1' } as never)
  })

  it('exports pagination and length constants', () => {
    expect(POSTS_PAGE_SIZE).toBe(30)
    expect(COMMENT_CONTENT_MAX).toBe(1000)
  })

  it('sortPostsForFeed keeps the original order for "new"', () => {
    const posts = [
      { id: 'b', created_at: '2026-01-02Z' },
      { id: 'a', created_at: '2026-01-01Z' },
    ] as Post[]
    expect(sortPostsForFeed(posts, 'new', () => ({ likes: 0, comments: 0 }))).toBe(posts)
  })

  it('sortPostsForFeed ranks "top" by likes + comments, newest on ties', () => {
    const posts = [
      { id: 'low', created_at: '2026-01-01Z' },
      { id: 'mid', created_at: '2026-01-02Z' },
      { id: 'high', created_at: '2026-01-03Z' },
      { id: 'tie1', created_at: '2026-01-04Z' },
      { id: 'tie2', created_at: '2026-01-05Z' },
    ] as Post[]
    const engagement = (p: { id: string }) => ({
      likes: p.id === 'high' ? 10 : 0,
      comments: p.id === 'mid' ? 1 : 0,
    })
    const result = sortPostsForFeed(posts, 'top', engagement)
    expect(result.map((p) => p.id)).toEqual(['high', 'mid', 'tie2', 'tie1', 'low'])
  })

  it('useClusterPosts fetches a cluster’s posts newest-first', async () => {
    mockResult.value = {
      data: [
        { id: 'p2', created_at: '2026-01-02T00:00:00Z' },
        { id: 'p1', created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    }
    const { result } = renderHook(() => useClusterPosts('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('posts').eq).toHaveBeenCalledWith('cluster_id', 'c1')
    expect(c.from('posts').order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result.current.data?.map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  it('useClusterPosts prunes removed posts but keeps earlier-page ones', async () => {
    const mk = (id: string, created_at: string) => ({ id, created_at })
    const olderPage = mk('old', '2026-01-01T00:00:00Z')
    const removed = mk('removed', '2026-02-15T00:00:00Z')
    const cutoff = mk('cut', '2026-01-31T00:00:00Z')
    const newer = Array.from({ length: POSTS_PAGE_SIZE - 1 }, (_, i) =>
      mk(`n${i}`, `2026-03-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    )
    const fresh = [cutoff, ...newer]
    queryClient.setQueryData(['cluster-posts', 'c1'], [olderPage, removed, ...fresh])
    mockResult.value = { data: fresh, error: null }

    const { result } = renderHook(() => useClusterPosts('c1'), { wrapper })
    await waitFor(() => expect(result.current.data?.some((p) => p.id === removed.id)).toBe(false))
    const ids = result.current.data?.map((p) => p.id) ?? []
    expect(ids).toContain(olderPage.id)
    expect(ids).not.toContain(removed.id)
    expect(ids).toHaveLength(fresh.length + 1)
  })

  it('useClusterPosts is disabled without a cluster', async () => {
    const { result } = renderHook(() => useClusterPosts(null), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('useRecentClusterPosts queries across cluster ids newest-first', async () => {
    mockResult.value = {
      data: [
        { id: 'p2', cluster_id: 'c2', created_at: '2026-01-02T00:00:00Z' },
        { id: 'p1', cluster_id: 'c1', created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    }
    const { result } = renderHook(() => useRecentClusterPosts(['c1', 'c2']), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('posts').in).toHaveBeenCalledWith('cluster_id', ['c1', 'c2'])
    expect(result.current.data?.map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  it('useRecentClusterPosts is disabled without clusters', async () => {
    const { result } = renderHook(() => useRecentClusterPosts([]), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('useUserPosts queries by author id', async () => {
    const { result } = renderHook(() => useUserPosts('u1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('posts').eq).toHaveBeenCalledWith('author_id', 'u1')
  })

  it('usePost fetches a single post by id', async () => {
    mockResult.value = { data: { id: 'p1', content: 'x' }, error: null }
    const { result } = renderHook(() => usePost('p1'), { wrapper })
    await waitFor(() => expect(result.current.data?.id).toBe('p1'))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('posts').eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('useClusterPostLikes queries only the loaded post ids', async () => {
    mockResult.value = { data: [{ post_id: 'p1', user_id: 'u1' }], error: null }
    const { result } = renderHook(() => useClusterPostLikes('c1', ['p1', 'p2']), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ post_id: 'p1', user_id: 'u1' }]))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('post_likes').in).toHaveBeenCalledWith('post_id', ['p1', 'p2'])
  })

  it('usePostLikes queries a single post’s likes', async () => {
    mockResult.value = { data: [{ post_id: 'p1', user_id: 'u1' }], error: null }
    const { result } = renderHook(() => usePostLikes('p1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ post_id: 'p1', user_id: 'u1' }]))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('post_likes').eq).toHaveBeenCalledWith('post_id', 'p1')
  })

  it('usePostLikes is disabled without a post', async () => {
    const { result } = renderHook(() => usePostLikes(null), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('useClusterCommentLikes queries only the loaded comment ids', async () => {
    mockResult.value = { data: [{ comment_id: 'x1', user_id: 'u1' }], error: null }
    const { result } = renderHook(() => useClusterCommentLikes('c1', ['x1', 'x2']), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ comment_id: 'x1', user_id: 'u1' }]))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('comment_likes').in).toHaveBeenCalledWith('comment_id', ['x1', 'x2'])
  })

  it('useToggleCommentLike calls toggle_comment_like and invalidates', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useToggleCommentLike('c1'), { wrapper })
    result.current.mutate('x1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('toggle_comment_like', { p_comment_id: 'x1' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['comment-likes', 'c1'] })
  })

  it('useToggleCommentLike writes the caller’s like optimistically before the round-trip', async () => {
    const pending = new Promise<never>(() => {})
    requireSupabaseMock.mockReturnValue({ rpc: vi.fn(() => pending) } as never)
    const { result } = renderHook(() => useToggleCommentLike('c1'), { wrapper })
    result.current.mutate('x1')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    const cached = queryClient.getQueryData<{ comment_id: string; user_id: string }[]>(['comment-likes', 'c1'])
    expect(cached).toEqual(
      expect.arrayContaining([expect.objectContaining({ comment_id: 'x1', user_id: 'u1' })]),
    )
  })

  it('useClusterPostComments queries bulk comments and orders ascending', async () => {
    mockResult.value = {
      data: [
        { id: 'x2', post_id: 'p1', created_at: 'T2' },
        { id: 'x1', post_id: 'p1', created_at: 'T1' },
      ],
      error: null,
    }
    const { result } = renderHook(() => useClusterPostComments('c1', ['p1']), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('post_comments').in).toHaveBeenCalledWith('post_id', ['p1'])
    expect(result.current.data?.map((x) => x.id)).toEqual(['x1', 'x2'])
  })

  it('usePostComments queries a single post’s comments', async () => {
    const { result } = renderHook(() => usePostComments('c1', 'p1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('post_comments').eq).toHaveBeenCalledWith('post_id', 'p1')
  })

  it('useCreatePost calls create_post and invalidates the cluster posts', async () => {
    mockResult.value = { data: 'new-post-id', error: null }
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreatePost('c1'), { wrapper })
    result.current.mutate({ content: 'hi', gifUrl: 'https://cdn/g.gif' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('create_post', {
      p_cluster_id: 'c1',
      p_content: 'hi',
      p_image_url: undefined,
      p_gif_url: 'https://cdn/g.gif',
      p_title: undefined,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cluster-posts', 'c1'] })
  })

  it('useCreatePost forwards an optional title', async () => {
    mockResult.value = { data: 'new-post-id', error: null }
    const { result } = renderHook(() => useCreatePost('c1'), { wrapper })
    result.current.mutate({ content: 'hi', title: 'A title' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('create_post', expect.objectContaining({ p_title: 'A title' }))
  })

  it('useEditPost calls edit_post and invalidates the single post', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useEditPost('c1'), { wrapper })
    result.current.mutate({ postId: 'p1', content: 'x' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('edit_post', { p_post_id: 'p1', p_content: 'x', p_title: undefined })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cluster-posts', 'single', 'p1'] })
  })

  it('useEditPost forwards an edited title', async () => {
    const { result } = renderHook(() => useEditPost('c1'), { wrapper })
    result.current.mutate({ postId: 'p1', content: 'x', title: 'Edited' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('edit_post', { p_post_id: 'p1', p_content: 'x', p_title: 'Edited' })
  })

  it('useDeletePost calls delete_post and invalidates the post + relations', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDeletePost('c1'), { wrapper })
    result.current.mutate('p1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('delete_post', { p_post_id: 'p1' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cluster-posts', 'single', 'p1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['post-likes', 'c1'] })
  })

  it('useTogglePostLike calls toggle_post_like and invalidates likes', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useTogglePostLike('c1'), { wrapper })
    result.current.mutate('p1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('toggle_post_like', { p_post_id: 'p1' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['post-likes', 'c1'] })
  })

  it('useTogglePostLike writes the caller’s like optimistically before the round-trip', async () => {
    // Hold the RPC pending so the optimistic write is observable pre-response.
    const pending = new Promise<never>(() => {})
    requireSupabaseMock.mockReturnValue({ rpc: vi.fn(() => pending) } as never)
    const { result } = renderHook(() => useTogglePostLike('c1'), { wrapper })
    result.current.mutate('p1')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    const cached = queryClient.getQueryData<{ post_id: string; user_id: string }[]>(['post-likes', 'c1'])
    expect(cached).toEqual(
      expect.arrayContaining([expect.objectContaining({ post_id: 'p1', user_id: 'u1' })]),
    )
  })

  it('useTogglePostLike writes the single-post likes cache optimistically', async () => {
    const pending = new Promise<never>(() => {})
    requireSupabaseMock.mockReturnValue({ rpc: vi.fn(() => pending) } as never)
    const { result } = renderHook(() => useTogglePostLike('c1'), { wrapper })
    result.current.mutate('p1')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    const cached = queryClient.getQueryData<{ post_id: string; user_id: string }[]>([
      'post-likes',
      'single',
      'p1',
    ])
    expect(cached).toEqual(
      expect.arrayContaining([expect.objectContaining({ post_id: 'p1', user_id: 'u1' })]),
    )
  })

  it('useLoadEarlierPosts prepends an earlier page and reports hasMore', async () => {
    queryClient.setQueryData(['cluster-posts', 'c1'], [
      { id: 'p3', created_at: '2026-01-03T00:00:00Z' },
    ])
    mockResult.value = {
      data: [
        { id: 'p1', created_at: '2026-01-01T00:00:00Z' },
        { id: 'p2', created_at: '2026-01-02T00:00:00Z' },
      ],
      error: null,
    }
    const { result } = renderHook(() => useLoadEarlierPosts('c1'), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    // compound cursor: created_at < oldest, OR (created_at == oldest AND id < oldest.id)
    expect(c.from('posts').or).toHaveBeenCalledWith(
      'created_at.lt.2026-01-03T00:00:00Z,and(created_at.eq.2026-01-03T00:00:00Z,id.lt.p3)',
    )
    expect(queryClient.getQueryData(['cluster-posts', 'c1'])?.map((p) => p.id as string)).toEqual([
      'p3',
      'p2',
      'p1',
    ])
    expect(result.current.data).toEqual({ added: 2, hasMore: false })
  })

  it('useCreateComment calls create_post_comment and invalidates comments', async () => {
    mockResult.value = { data: 'new-comment', error: null }
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreateComment('c1'), { wrapper })
    result.current.mutate({ postId: 'p1', content: 'hello' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('create_post_comment', {
      p_post_id: 'p1',
      p_content: 'hello',
      p_image_url: undefined,
      p_gif_url: undefined,
      p_parent_comment_id: undefined,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['post-comments', 'c1'] })
  })

  it('useCreateComment forwards a parent comment for a reply', async () => {
    mockResult.value = { data: 'reply-id', error: null }
    const { result } = renderHook(() => useCreateComment('c1'), { wrapper })
    result.current.mutate({ postId: 'p1', content: 'a reply', parentCommentId: 'c9' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('create_post_comment', {
      p_post_id: 'p1',
      p_content: 'a reply',
      p_image_url: undefined,
      p_gif_url: undefined,
      p_parent_comment_id: 'c9',
    })
  })

  it('useDeleteComment calls delete_post_comment and invalidates comments', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteComment('c1'), { wrapper })
    result.current.mutate('x1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('delete_post_comment', { p_comment_id: 'x1' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['post-comments', 'c1'] })
  })

  it('useReportPost calls report_post and invalidates reports', async () => {
    mockResult.value = { data: 'report-id', error: null }
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useReportPost('c1'), { wrapper })
    result.current.mutate({ postId: 'p1', reason: 'spam' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('report_post', {
      p_cluster_id: 'c1',
      p_post_id: 'p1',
      p_reason: 'spam',
      p_details: undefined,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reports'] })
  })

  it('useReportComment calls report_post_comment and invalidates reports', async () => {
    const { result } = renderHook(() => useReportComment('c1'), { wrapper })
    result.current.mutate({ commentId: 'x1', reason: 'other', details: 'detail' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.rpc).toHaveBeenCalledWith('report_post_comment', {
      p_cluster_id: 'c1',
      p_comment_id: 'x1',
      p_reason: 'other',
      p_details: 'detail',
    })
  })

  it('useClusterPosts surfaces a query error', async () => {
    mockResult.value = { data: null, error: { message: 'boom' } }
    const { result } = renderHook(() => useClusterPosts('c1'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('boom')
  })

  it('postImageStoragePath passes bare paths through and strips signed-URL noise', () => {
    expect(postImageStoragePath('c1/a.png')).toBe('c1/a.png')
    expect(postImageStoragePath('')).toBeNull()
    expect(postImageStoragePath(null)).toBeNull()
    expect(
      postImageStoragePath('https://p.supabase.co/storage/v1/object/sign/posts-images/c1%2Fa.png?token=t'),
    ).toBe('c1/a.png')
  })

  it('usePostImageUrl resolves a signed URL from storage', async () => {
    mockResult.value = { data: { signedUrl: 'signed://x' }, error: null }
    const { result } = renderHook(() => usePostImageUrl('c1/a.png'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe('signed://x'))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.storage.from('posts-images').createSignedUrl).toHaveBeenCalledWith('c1/a.png', 3600)
  })

  it('usePostImageUrl is disabled and throws without a path', async () => {
    const { result } = renderHook(() => usePostImageUrl(null), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    mockResult.value = { data: {}, error: asError('No signed URL') }
    const withPath = renderHook(() => usePostImageUrl('x'), { wrapper })
    await waitFor(() => expect(withPath.result.current.isError).toBe(true))
  })
})
