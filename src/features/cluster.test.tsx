import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, type MockSupabaseResult } from '../test/supabase-client'
import {
  CHAT_PAGE_SIZE,
  useChatImageUrl,
  useClusterMessages,
  useClusterReactions,
  useDeleteMessage,
  useEditMessage,
  useIntroQuestionMap,
  useLeaveCluster,
  useLoadEarlierMessages,
  useMemberMoods,
  useSendMessage,
  useSetMood,
  useToggleReaction,
  useUpdateProfile,
} from './cluster'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))
vi.mock('../app/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/auth-context')>()
  return {
    ...actual,
    useAuth: vi.fn(() => ({ state: 'signedIn', userId: 'u1', email: 'a@b.test' })),
  }
})

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

describe('cluster', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' } as never)
  })

  it('useClusterMessages fetches the latest page and returns it oldest-first', async () => {
    mockResult.value = {
      data: [
        { id: 'm2', created_at: '2026-01-02T00:00:00Z' },
        { id: 'm1', created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    }
    const { result } = renderHook(() => useClusterMessages('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    const from = c.from('messages')
    expect(from.eq).toHaveBeenCalledWith('cluster_id', 'c1')
    expect(from.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(from.limit).toHaveBeenCalledWith(CHAT_PAGE_SIZE)
    expect(result.current.data?.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('useClusterMessages keeps earlier pages already in the cache across refetches', async () => {
    queryClient.setQueryData(['cluster-messages', 'c1'], [
      { id: 'm0', created_at: '2026-01-01T00:00:00Z' },
      { id: 'm3', created_at: '2026-01-03T00:00:00Z' },
    ])
    mockResult.value = {
      data: [
        { id: 'm1', created_at: '2026-01-02T00:00:00Z' },
        { id: 'm2', created_at: '2026-01-02T00:00:30Z' },
        { id: 'm3', created_at: '2026-01-03T00:00:00Z' },
      ],
      error: null,
    }
    const { result } = renderHook(() => useClusterMessages('c1'), { wrapper })
    // m0 precedes the fresh window so it survives the refetch; m3 is replaced,
    // not duplicated.
    await waitFor(() =>
      expect(result.current.data?.map((m) => m.id)).toEqual(['m0', 'm1', 'm2', 'm3']),
    )
  })

  it('useLoadEarlierMessages prepends an earlier page and reports hasMore', async () => {
    queryClient.setQueryData(['cluster-messages', 'c1'], [
      { id: 'm3', created_at: '2026-01-03T00:00:00Z' },
    ])
    mockResult.value = {
      data: [
        { id: 'm1', created_at: '2026-01-01T00:00:00Z' },
        { id: 'm2', created_at: '2026-01-02T00:00:00Z' },
      ],
      error: null,
    }
    const { result } = renderHook(() => useLoadEarlierMessages('c1'), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    // inclusive cursor so messages sharing the oldest timestamp aren't skipped
    expect(c.from('messages').lte).toHaveBeenCalledWith('created_at', '2026-01-03T00:00:00Z')
    expect(queryClient.getQueryData(['cluster-messages', 'c1'])).toEqual([
      { id: 'm1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'm2', created_at: '2026-01-02T00:00:00Z' },
      { id: 'm3', created_at: '2026-01-03T00:00:00Z' },
    ])
    expect(result.current.data).toEqual({ added: 2, hasMore: false })
  })

  it('useLoadEarlierMessages skips the cursor when nothing is loaded yet', async () => {
    mockResult.value = { data: [{ id: 'm1', created_at: 't1' }], error: null }
    const { result } = renderHook(() => useLoadEarlierMessages('c1'), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('messages').lte).not.toHaveBeenCalled()
    expect(result.current.data).toEqual({ added: 1, hasMore: false })
  })

  it('useSendMessage sends content through the RPC and invalidates', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSendMessage(), { wrapper })
    result.current.mutate({ clusterId: 'c1', content: 'hi', imageUrl: 'x/y.png' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('send_message', {
      p_cluster_id: 'c1',
      p_content: 'hi',
      p_image_url: 'x/y.png',
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['cluster-messages', 'c1'] })
  })

  it('useSetMood calls set_mood with the mood', async () => {
    const { result } = renderHook(() => useSetMood(), { wrapper })
    result.current.mutate({ clusterId: 'c1', mood: 'great' as never })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('set_mood', {
      p_cluster_id: 'c1',
      p_mood: 'great',
    })
  })

  it('useClusterReactions returns empty when no messages are loaded', async () => {
    const { result } = renderHook(() => useClusterReactions('c1', []), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([]))
  })

  it('useClusterReactions queries only the loaded message ids', async () => {
    mockResult.value = { data: [{ id: 'r1', message_id: 'm1' }], error: null }
    const { result } = renderHook(() => useClusterReactions('c1', ['m1', 'm2']), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'r1', message_id: 'm1' }]))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('message_reactions').in).toHaveBeenCalledWith('message_id', ['m1', 'm2'])
  })

  it('useToggleReaction deletes an existing reaction', async () => {
    mockResult.value = { data: { message_id: 'm1' }, error: null }
    const { result } = renderHook(() => useToggleReaction('c1'), { wrapper })
    result.current.mutate({ messageId: 'm1', emoji: ':wave:' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('message_reactions').delete).toHaveBeenCalled()
    expect(c.from('message_reactions').insert).not.toHaveBeenCalled()
  })

  it('useToggleReaction inserts a new reaction when none exists', async () => {
    mockResult.value = { data: null, error: null }
    const { result } = renderHook(() => useToggleReaction('c1'), { wrapper })
    result.current.mutate({ messageId: 'm1', emoji: ':heart:' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('message_reactions').insert).toHaveBeenCalledWith({
      message_id: 'm1',
      user_id: 'u1',
      emoji: ':heart:',
    })
  })

  it('useEditMessage updates its own message row', async () => {
    const { result } = renderHook(() => useEditMessage('c1'), { wrapper })
    result.current.mutate({ messageId: 'm1', content: 'x' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('messages').update).toHaveBeenCalledWith({ content: 'x', edited_at: expect.any(String) })
  })

  it('useDeleteMessage soft-deletes its own message', async () => {
    const { result } = renderHook(() => useDeleteMessage('c1'), { wrapper })
    result.current.mutate('m1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('messages').update).toHaveBeenCalledWith({ deleted_at: expect.any(String) })
  })

  it('useChatImageUrl resolves a signed URL from storage', async () => {
    mockResult.value = { data: { signedUrl: 'signed://x' }, error: null }
    const { result } = renderHook(() => useChatImageUrl('c1/a.png'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe('signed://x'))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.storage.from).toHaveBeenCalledWith('chat-images')
    expect(c.storage.from('chat-images').createSignedUrl).toHaveBeenCalledWith('c1/a.png', 3600)
  })

  it('useChatImageUrl throws without a signed URL', async () => {
    mockResult.value = { data: {}, error: null }
    const { result } = renderHook(() => useChatImageUrl('x'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('useMemberMoods is disabled until both ids exist', () => {
    renderHook(() => useMemberMoods('c1', null), { wrapper })
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('useIntroQuestionMap builds a prompt map', async () => {
    mockResult.value = { data: [{ id: 1, prompt: 'Q1' }], error: null }
    const { result } = renderHook(() => useIntroQuestionMap(), { wrapper })
    await waitFor(() => expect(result.current.data?.get(1)).toBe('Q1'))
  })

  it('useLeaveCluster invalidates the user’s clusters', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useLeaveCluster(), { wrapper })
    result.current.mutate('c1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['my-clusters', 'u1'] })
  })

  it('useUpdateProfile invalidates the profile and member queries', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateProfile(), { wrapper })
    result.current.mutate({ display_name: 'Ally' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('profiles').eq).toHaveBeenCalledWith('id', 'u1')
    expect(spy).toHaveBeenCalledWith({ queryKey: ['cluster-members'] })
  })
})