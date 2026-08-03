import { afterEach, describe, expect, it, vi } from 'vitest'

// supabase.ts reads import.meta.env at module load, so each case re-imports a
// fresh module after stubbing the environment.
describe('requireSupabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is null and throws a helpful error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const mod = await import('./supabase')
    expect(mod.supabase).toBeNull()
    expect(() => mod.requireSupabase()).toThrow(/Supabase is not configured/i)
  })

  it('builds a client and returns it once when both env vars are set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test')
    const mod = await import('./supabase')
    expect(mod.supabase).not.toBeNull()
    expect(mod.requireSupabase()).toBe(mod.supabase)
  })
})