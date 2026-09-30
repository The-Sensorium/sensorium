import { beforeEach, describe, expect, it, vi } from 'vitest'

const exchangeCodeForSession = vi.fn()
const verifyOtp = vi.fn()
const setSession = vi.fn()

vi.mock('./supabase', () => ({
  requireSupabase: () => ({
    auth: { exchangeCodeForSession, verifyOtp, setSession },
  }),
}))

vi.mock('expo-linking', () => ({
  createURL: (path: string) => `sensorium://${path}`,
  parse: (url: string) => {
    const query = url.split('#')[0].split('?')[1] ?? ''
    const queryParams: Record<string, string | string[]> = {}
    for (const [key, value] of new URLSearchParams(query)) {
      const existing = queryParams[key]
      if (existing === undefined) queryParams[key] = value
      else if (Array.isArray(existing)) existing.push(value)
      else queryParams[key] = [existing, value]
    }
    return { queryParams }
  },
}))

import { handleAuthCallback } from './deep-links'

beforeEach(() => {
  vi.clearAllMocks()
  exchangeCodeForSession.mockResolvedValue({ error: null })
  verifyOtp.mockResolvedValue({ error: null })
  setSession.mockResolvedValue({ error: null })
})

describe('handleAuthCallback with PKCE code links', () => {
  it('exchanges the code for a session', async () => {
    await expect(handleAuthCallback('sensorium://auth/callback?code=code-session-1')).resolves.toBe(
      'session',
    )
    expect(exchangeCodeForSession).toHaveBeenCalledWith('code-session-1')
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(setSession).not.toHaveBeenCalled()
  })

  it('returns recovery for a recovery code link', async () => {
    await expect(
      handleAuthCallback('sensorium://auth/callback?code=code-recovery-1&type=recovery'),
    ).resolves.toBe('recovery')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('code-recovery-1')
  })

  it('dedupes concurrent exchanges of the same single-use code', async () => {
    const url = 'sensorium://auth/callback?code=code-shared-1'
    await expect(Promise.all([handleAuthCallback(url), handleAuthCallback(url)])).resolves.toEqual([
      'session',
      'session',
    ])
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('reuses the cached result instead of exchanging twice', async () => {
    const url = 'sensorium://auth/callback?code=code-cached-1'
    await handleAuthCallback(url)
    await handleAuthCallback(url)
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('throws when the exchange fails and retries on the next call', async () => {
    const url = 'sensorium://auth/callback?code=code-failing-1'
    exchangeCodeForSession.mockRejectedValueOnce(new Error('exchange failed'))
    await expect(handleAuthCallback(url)).rejects.toThrow('exchange failed')
    await expect(handleAuthCallback(url)).resolves.toBe('session')
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(2)
  })

  it('throws when the exchange returns an error', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('bad code') })
    await expect(handleAuthCallback('sensorium://auth/callback?code=code-bad-1')).rejects.toThrow(
      'bad code',
    )
  })
})

describe('handleAuthCallback with token_hash links', () => {
  it('verifies a recovery link and routes to password reset', async () => {
    await expect(
      handleAuthCallback('sensorium://reset-password?token_hash=hash-recovery-1&type=recovery'),
    ).resolves.toBe('recovery')
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-recovery-1', type: 'recovery' })
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(setSession).not.toHaveBeenCalled()
  })

  it('verifies a signup link as a session', async () => {
    await expect(
      handleAuthCallback('sensorium://verify-email?token_hash=hash-signup-1&type=signup'),
    ).resolves.toBe('session')
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-signup-1', type: 'signup' })
  })

  it('rejects unsupported OTP types without verifying', async () => {
    await expect(
      handleAuthCallback('sensorium://reset-password?token_hash=hash-otp-1&type=phone_change'),
    ).rejects.toThrow('Unsupported link type.')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('throws when verification fails', async () => {
    verifyOtp.mockResolvedValueOnce({ error: new Error('expired') })
    await expect(
      handleAuthCallback('sensorium://reset-password?token_hash=hash-expired-1&type=recovery'),
    ).rejects.toThrow('expired')
  })
})

describe('handleAuthCallback with implicit hash links', () => {
  it('establishes the session from hash tokens', async () => {
    await expect(
      handleAuthCallback('sensorium://auth/callback#access_token=at-1&refresh_token=rt-1'),
    ).resolves.toBe('session')
    expect(setSession).toHaveBeenCalledWith({ access_token: 'at-1', refresh_token: 'rt-1' })
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('returns recovery for a hash link carrying the recovery type', async () => {
    await expect(
      handleAuthCallback(
        'sensorium://reset-password#access_token=at-2&refresh_token=rt-2&type=recovery',
      ),
    ).resolves.toBe('recovery')
    expect(setSession).toHaveBeenCalledWith({ access_token: 'at-2', refresh_token: 'rt-2' })
  })

  it('throws when establishing the session fails', async () => {
    setSession.mockResolvedValueOnce({ error: new Error('bad tokens') })
    await expect(
      handleAuthCallback('sensorium://auth/callback#access_token=bad&refresh_token=bad'),
    ).rejects.toThrow('bad tokens')
  })
})

describe('handleAuthCallback with error and unrelated links', () => {
  it('throws the provider error description', async () => {
    await expect(
      handleAuthCallback(
        'sensorium://auth/callback?error=access_denied&error_description=denied+by+user',
      ),
    ).rejects.toThrow('denied by user')
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(setSession).not.toHaveBeenCalled()
  })

  it('throws a default message when the provider gives no description', async () => {
    await expect(handleAuthCallback('sensorium://auth/callback?error=server_error')).rejects.toThrow(
      'Google sign-in did not complete.',
    )
  })

  it('ignores links without auth payload', async () => {
    await expect(handleAuthCallback('sensorium://home')).resolves.toBeNull()
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(setSession).not.toHaveBeenCalled()
  })

  it('ignores a hash fragment without session tokens', async () => {
    await expect(handleAuthCallback('sensorium://auth/callback#some=thing')).resolves.toBeNull()
    expect(setSession).not.toHaveBeenCalled()
  })

  it('ignores a token_hash without a type', async () => {
    await expect(handleAuthCallback('sensorium://reset-password?token_hash=hash-only-1')).resolves.toBeNull()
    expect(verifyOtp).not.toHaveBeenCalled()
  })
})
