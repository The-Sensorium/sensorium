import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MockSupabaseResult {
  data: unknown
  error: unknown
}

/**
 * Shared stub used by feature-hook tests. Every chain method is awaitable and
 * resolves the current `ref.value`, so individual tests swap results by setting
 * `ref.value` before triggering a query/mutation.
 */
export function makeSupabaseClient(ref: { value: MockSupabaseResult }) {
  const chain = () => {
    const ship: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => resolve(ref.value),
    }
    for (const m of ['select', 'eq', 'in', 'order', 'maybeSingle', 'single', 'limit', 'lt', 'gt', 'lte', 'gte', 'update', 'upsert', 'insert', 'delete', 'is', 'not', 'throwOnError', 'or']) {
      ship[m] = vi.fn(() => ship)
    }
    return ship
  }
  const sharedChain = chain()
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => ({})),
  }
  const storageBucket = {
    createSignedUrl: vi.fn(() => Promise.resolve(ref.value)),
    upload: vi.fn(() => Promise.resolve(ref.value)),
    remove: vi.fn(() => Promise.resolve(ref.value)),
  }
  return {
    from: vi.fn(() => sharedChain),
    rpc: vi.fn(() => Promise.resolve(ref.value)),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => storageBucket) },
  } as unknown as SupabaseClient
}

export function initialMockResult(): { value: MockSupabaseResult } {
  return { value: { data: [], error: null } }
}

export function asError(message: string): MockSupabaseResult {
  return { data: null, error: { message } }
}