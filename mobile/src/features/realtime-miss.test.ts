import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}))
vi.mock('react-native-url-polyfill/auto', () => ({}))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

import { patchMessageInsert } from './realtime'
import type { Database } from '../lib/database.types'

type Message = Database['public']['Tables']['messages']['Row']

function message(id: string, created_at: string): Message {
  return {
    id,
    cluster_id: 'c1',
    author_id: 'u1',
    content: 'hello',
    created_at,
  } as unknown as Message
}

function clientWith(rows: Message[] | undefined) {
  const qc = new QueryClient()
  if (rows !== undefined) qc.setQueryData(['cluster-messages', 'c1'], rows)
  return qc
}

describe('patchMessageInsert', () => {
  it('appends a new message to the cached room in order', () => {
    const qc = clientWith([message('m1', '2026-01-01T00:00:00Z')])
    patchMessageInsert(qc, 'c1', message('m2', '2026-01-01T00:01:00Z'))
    expect(qc.getQueryData<Message[]>(['cluster-messages', 'c1'])?.map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ])
  })

  it('ignores a duplicate of an already cached message', () => {
    const qc = clientWith([message('m1', '2026-01-01T00:00:00Z')])
    patchMessageInsert(qc, 'c1', message('m1', '2026-01-01T00:00:00Z'))
    expect(qc.getQueryData<Message[]>(['cluster-messages', 'c1'])?.map((m) => m.id)).toEqual([
      'm1',
    ])
  })

  it('refetches instead of dropping when there is no cache yet', () => {
    const qc = clientWith(undefined)
    const spy = vi.spyOn(qc, 'invalidateQueries')
    patchMessageInsert(qc, 'c1', message('m9', '2026-01-01T00:09:00Z'))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['cluster-messages', 'c1'] })
    expect(qc.getQueryData(['cluster-messages', 'c1'])).toBeUndefined()
  })

  it('appends to an empty room instead of refetching', () => {
    const qc = clientWith([])
    const spy = vi.spyOn(qc, 'invalidateQueries')
    patchMessageInsert(qc, 'c1', message('m1', '2026-01-01T00:01:00Z'))
    expect(spy).not.toHaveBeenCalled()
    expect(qc.getQueryData<Message[]>(['cluster-messages', 'c1'])?.map((m) => m.id)).toEqual([
      'm1',
    ])
  })
})
