import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, asError, type MockSupabaseResult } from '../test/supabase-client'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  notificationTarget,
  PREF_LABELS,
  PREF_TOGGLES,
  timeAgo,
  useMarkAllNotificationsRead,
  useMarkClusterRead,
  useMarkNotificationRead,
  useMyNotifications,
  useNotificationPrefs,
  useNotificationsChannel,
  useUpsertNotificationPrefs,
  useUnreadCount,
} from './notifications'
import type { MyNotification } from './notifications'

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

describe('notificationTarget', () => {
  const n = (type: MyNotification['type'], clusterId: string | null, signalId?: string): MyNotification =>
    ({
      id: 'n1',
      type,
      user_id: 'u1',
      cluster_id: clusterId,
      payload: signalId ? { signal_id: signalId } : {},
      read_at: null,
      created_at: null,
    }) as unknown as MyNotification

  it('deep-links message-type notifications to the cluster', () => {
    expect(notificationTarget(n('message', 'c1'))).toEqual({ to: '/cluster/c1' })
  })

  it('links signal_new to the signal thread when present', () => {
    expect(notificationTarget(n('signal_new', 'c1', 'sig9'))).toEqual({ to: '/cluster/c1/signals/sig9' })
    expect(notificationTarget(n('signal_new', 'c1'))).toEqual({ to: '/cluster/c1/signals' })
  })

  it('links vote notifications to the votes view', () => {
    expect(notificationTarget(n('vote_started', 'c1'))?.to).toContain('/votes')
  })

  it('links invitations and queue updates', () => {
    expect(notificationTarget(n('invitation_received', 'c1'))).toEqual({ to: '/home' })
    expect(notificationTarget(n('queue_update', 'c1'))).toEqual({ to: '/clusters' })
  })

  it('falls back to the cluster, or null when unmappable and clusterless', () => {
    expect(notificationTarget(n('reaction', null))).toBeNull()
    expect(notificationTarget(n('some_unknown_type' as MyNotification['type'], 'c1'))).toEqual({
      to: '/cluster/c1',
    })
  })
})

describe('timeAgo', () => {
  it('says just now for under a minute', () => {
    expect(timeAgo(new Date(Date.now() - 5_000).toISOString())).toBe('just now')
  })

  it('renders relative minutes, hours, and days', () => {
    expect(timeAgo(new Date(Date.now() - 10 * 60_000).toISOString())).toContain('10')
    expect(timeAgo(new Date(Date.now() - 3 * 3_600_000).toISOString())).toContain('3')
    expect(timeAgo(new Date(Date.now() - 12 * 86_400_000).toISOString())).toContain('12')
  })

  it('falls back to a calendar date beyond a month', () => {
    const out = timeAgo(new Date(Date.now() - 40 * 86_400_000).toISOString())
    expect(out).not.toBe('just now')
    expect(out).not.toMatch(/minute|hour|day/)
  })
})

describe('pref constants', () => {
  it('exposes the full toggle set and labels', () => {
    expect(PREF_TOGGLES).toHaveLength(8)
    expect(PREF_LABELS.votes).toBe('Votes & replacements')
  })
})

describe('hooks', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' } as never)
  })

  it('useMyNotifications fetches via get_my_notifications', async () => {
    mockResult.value = { data: [{ id: 'n1' }], error: null }
    const { result } = renderHook(() => useMyNotifications(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'n1' }]))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_my_notifications')
  })

  it('useUnreadCount returns a count or 0', async () => {
    mockResult.value = { data: 4, error: null }
    const { result } = renderHook(() => useUnreadCount(), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(4))
  })

  it('useNotificationPrefs is disabled while signed out', () => {
    useAuthMock.mockReturnValue({ state: 'signedOut' } as never)
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('useMarkNotificationRead updates its own row and re-reads', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper })
    result.current.mutate('n1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.from('notifications').update).toHaveBeenCalledWith({ read_at: expect.any(String) })
    expect(client.from('notifications').eq).toHaveBeenCalledWith('id', 'n1')
    expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications', 'u1'] })
  })

  it('useMarkAllNotificationsRead clears events and chat via mark_all_read', async () => {
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('mark_all_read')
  })

  it('useMarkClusterRead advances the cluster read marker via RPC', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useMarkClusterRead(), { wrapper })
    result.current.mutate('c1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('mark_cluster_read', {
      p_cluster_id: 'c1',
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications', 'unread'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications', 'u1'] })
  })

  it('useUpsertNotificationPrefs upserts with a conflict target', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpsertNotificationPrefs(), { wrapper })
    result.current.mutate({ clusterId: 'c1', toggles: { messages: false } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.from('notification_prefs').upsert).toHaveBeenCalledWith(
      { user_id: 'u1', cluster_id: 'c1', messages: false },
      { onConflict: 'user_id,cluster_id' },
    )
    expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications', 'unread'] })
  })

  it('useMyNotifications propagates an RPC error', async () => {
    mockResult.value = asError('pg down')
    const { result } = renderHook(() => useMyNotifications(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('pg down')
  })
})

describe('useNotificationsChannel', () => {
  it('subscribes to the user channel and removes it on unmount', () => {
    const channelMock = {
      on: vi.fn(() => channelMock),
      subscribe: vi.fn(() => ({})),
    }
    const removeChannel = vi.fn()
    const client = {
      channel: vi.fn(() => channelMock),
      removeChannel,
    } as unknown as SupabaseClient
    requireSupabaseMock.mockReturnValue(client)

    const { unmount } = renderHook(() => useNotificationsChannel('u1'), { wrapper })
    expect(client.channel).toHaveBeenCalledWith('user:u1')
    expect(channelMock.subscribe).toHaveBeenCalledTimes(1)
    unmount()
    expect(removeChannel).toHaveBeenCalledTimes(1)
  })

  it('does not subscribe when there is no user', () => {
    const client = makeSupabaseClient(initialMockResult())
    const channelSpy = client.channel
    requireSupabaseMock.mockReturnValue(client as never)
    renderHook(() => useNotificationsChannel(null), { wrapper })
    expect(channelSpy).not.toHaveBeenCalled()
  })
})