import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, asError, type MockSupabaseResult } from '../test/supabase-client'
import {
  parseVoteResult,
  useAcceptInvitation,
  useClusterVoteResponses,
  useClusterVotes,
  useDeclineInvitation,
  useMyPendingInvitations,
  useReplacementCandidates,
  useReplacementRound,
  useStartNameVote,
  useStartReplaceVote,
  useVoteOn,
} from './votes'

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

describe('votes', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' } as never)
  })

  describe('parseVoteResult', () => {
    it('returns null for null, non-object, or array results', () => {
      expect(parseVoteResult(null)).toBeNull()
      expect(parseVoteResult('oops' as never)).toBeNull()
      expect(parseVoteResult([] as never)).toBeNull()
    })

    it('parses a full result object', () => {
      const r = parseVoteResult({
        outcome: 'passed',
        yes: 5,
        no: 2,
        cast: 7,
        quorum: 6,
        name: 'Nebula',
      })
      expect(r).toEqual({ outcome: 'passed', yes: 5, no: 2, cast: 7, quorum: 6, name: 'Nebula' })
    })

    it('coerces non-number fields to 0 and an unknown outcome', () => {
      const r = parseVoteResult({ outcome: 1, yes: 'x' } as never)
      expect(r).toEqual({ outcome: 'unknown', yes: 0, no: 0, cast: 0, quorum: 0, name: undefined })
    })
  })

  it('useClusterVotes queries votes for a cluster', async () => {
    const { result } = renderHook(() => useClusterVotes('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.from).toHaveBeenCalledWith('votes')
    expect(client.from('votes').eq).toHaveBeenCalledWith('cluster_id', 'c1')
  })

  it('useClusterVoteResponses returns empty when the cluster has no votes', async () => {
    const { result } = renderHook(() => useClusterVoteResponses('c1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([]))
  })

  it('useReplacementRound reads the first row of get_replacement_round', async () => {
    mockResult.value = { data: [{ id: 'round-1' }], error: null }
    const { result } = renderHook(() => useReplacementRound('c1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ id: 'round-1' }))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_replacement_round', {
      p_cluster_id: 'c1',
    })
  })

  it('useReplacementCandidates throws when there is no round', async () => {
    mockResult.value = asError('nope')
    const { result } = renderHook(() => useReplacementCandidates('round-1'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('nope')
  })

  it('useMyPendingInvitations is disabled while signed out', () => {
    useAuthMock.mockReturnValue({ state: 'signedOut' } as never)
    const { result } = renderHook(() => useMyPendingInvitations(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('useStartNameVote calls start_name_vote and invalidates vote queries', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useStartNameVote('c1'), { wrapper })
    result.current.mutate('Orion')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('start_name_vote', {
      p_cluster_id: 'c1',
      p_name: 'Orion',
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['cluster-votes', 'c1'] })
  })

  it('useStartReplaceVote throws when there is no cluster', async () => {
    const { result } = renderHook(() => useStartReplaceVote(null), { wrapper })
    await expect(result.current.mutateAsync('m2')).rejects.toThrow('No cluster')
  })

  it('useVoteOn calls vote_on with the chosen response', async () => {
    const { result } = renderHook(() => useVoteOn('c1'), { wrapper })
    result.current.mutate({ voteId: 'v1', choice: 'yes' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('vote_on', {
      p_vote_id: 'v1',
      p_choice: 'yes',
    })
  })

  it('useAcceptInvitation invalidates invitation, cluster, and matching queries', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAcceptInvitation(), { wrapper })
    result.current.mutate('inv-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('accept_invitation', {
      p_invitation_id: 'inv-1',
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['my-clusters', 'u1'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['matching-status', 'u1'] })
  })

  it('useDeclineInvitation invalidates matching status', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDeclineInvitation(), { wrapper })
    result.current.mutate('inv-2')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['matching-status', 'u1'] })
  })
})