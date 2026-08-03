import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, type MockSupabaseResult } from '../test/supabase-client'
import {
  useCluster,
  useIntroProgress,
  useIntroQuestions,
  useMyMembership,
  useSubmitIntroAnswers,
} from './introductions'

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

describe('introductions', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' } as never)
  })

  it('useCluster reads a single cluster or null', async () => {
    mockResult.value = { data: { id: 'c1' }, error: null }
    const { result } = renderHook(() => useCluster('c1'), { wrapper })
    await waitFor(() => expect(result.current.data?.id).toBe('c1'))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('clusters').eq).toHaveBeenCalledWith('id', 'c1')
  })

  it('useCluster returns null when missing', async () => {
    mockResult.value = { data: null, error: null }
    const { result } = renderHook(() => useCluster('nope'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeNull())
  })

  it('useMyMembership is disabled until both ids exist', () => {
    renderHook(() => useMyMembership(null), { wrapper })
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('useMyMembership fetches the caller’s row', async () => {
    mockResult.value = { data: { cluster_id: 'c1', user_id: 'u1' }, error: null }
    const { result } = renderHook(() => useMyMembership('c1'), { wrapper })
    await waitFor(() => expect(result.current.data).not.toBeNull())
  })

  it('useIntroQuestions reads all intro questions', async () => {
    mockResult.value = { data: [{ id: 1 }, { id: 2 }], error: null }
    const { result } = renderHook(() => useIntroQuestions(), { wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_intro_questions')
  })

  it('useIntroProgress fetches progress per cluster', async () => {
    const { result } = renderHook(() => useIntroProgress('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_intro_progress', {
      p_cluster_id: 'c1',
    })
  })

  it('useSubmitIntroAnswers maps answers to question rows and invalidates', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSubmitIntroAnswers(), { wrapper })
    result.current.mutate({ clusterId: 'c1', answers: { 1: 'blue', 2: 'city' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('submit_intro_answers', {
      p_cluster_id: 'c1',
      p_answers: [
        { question_id: 1, answer: 'blue' },
        { question_id: 2, answer: 'city' },
      ],
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['cluster-membership', 'c1'] })
  })
})