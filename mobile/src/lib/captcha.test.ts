import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const OLD_ENV = process.env.EXPO_PUBLIC_WEB_URL

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.EXPO_PUBLIC_WEB_URL
  else process.env.EXPO_PUBLIC_WEB_URL = OLD_ENV
  vi.resetModules()
})

async function challengeUrl(): Promise<string | null> {
  const { captchaChallengeUrl } = await import('./captcha')
  return captchaChallengeUrl()
}

async function helpers() {
  return import('./captcha')
}

describe('captchaChallengeUrl', () => {
  it('returns null when the web URL is unset', async () => {
    delete process.env.EXPO_PUBLIC_WEB_URL
    expect(await challengeUrl()).toBeNull()
  })

  it('returns null for a whitespace-only value', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = '   '
    expect(await challengeUrl()).toBeNull()
  })

  it('appends the challenge path and trims slashes', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://preview.thesensorium.online///  '
    expect(await challengeUrl()).toBe('https://preview.thesensorium.online/auth/mobile-challenge')
  })

  it('rejects non-URL values', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'not a url'
    expect(await challengeUrl()).toBeNull()
  })

  it('rejects non-http schemes', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'ftp://example.com'
    expect(await challengeUrl()).toBeNull()
  })

  it('normalizes to the origin before appending the path', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://example.com/some/path'
    expect(await challengeUrl()).toBe('https://example.com/auth/mobile-challenge')
  })
})

describe('parseChallengeToken', () => {
  it('extracts the token from a valid message', async () => {
    const { parseChallengeToken } = await helpers()
    expect(
      parseChallengeToken(JSON.stringify({ type: 'turnstile-token', token: 'abc' })),
    ).toBe('abc')
  })

  it('rejects non-JSON, wrong types, and empty tokens', async () => {
    const { parseChallengeToken } = await helpers()
    expect(parseChallengeToken('not json')).toBeNull()
    expect(parseChallengeToken(JSON.stringify({ type: 'other', token: 'abc' }))).toBeNull()
    expect(parseChallengeToken(JSON.stringify({ type: 'turnstile-token', token: '' }))).toBeNull()
    expect(parseChallengeToken(JSON.stringify({ type: 'turnstile-token' }))).toBeNull()
  })
})

describe('isAllowedChallengeNavigation', () => {
  it('compares origins exactly', async () => {
    const { isAllowedChallengeNavigation } = await helpers()
    const origin = 'https://preview.thesensorium.online'
    expect(
      isAllowedChallengeNavigation(`${origin}/auth/mobile-challenge`, origin),
    ).toBe(true)
    expect(isAllowedChallengeNavigation(`${origin}.evil.com/x`, origin)).toBe(false)
    expect(isAllowedChallengeNavigation('not a url', origin)).toBe(false)
  })
})
