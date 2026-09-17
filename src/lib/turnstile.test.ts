import { beforeEach, describe, expect, it, vi } from 'vitest'
import { turnstileSiteKey } from './turnstile'

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('turnstileSiteKey', () => {
  it('returns an empty string when the env var is unset', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    expect(turnstileSiteKey()).toBe('')
  })

  it('returns an empty string when the env var is undefined', () => {
    delete import.meta.env.VITE_TURNSTILE_SITE_KEY
    expect(turnstileSiteKey()).toBe('')
  })

  it('trims surrounding whitespace', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '  site-key-123  ')
    expect(turnstileSiteKey()).toBe('site-key-123')
  })

  it('treats a whitespace-only value as unset', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '   ')
    expect(turnstileSiteKey()).toBe('')
  })

  it('returns the configured site key', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-123')
    expect(turnstileSiteKey()).toBe('site-key-123')
  })
})
