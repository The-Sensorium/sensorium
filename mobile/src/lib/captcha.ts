const webUrl = process.env.EXPO_PUBLIC_WEB_URL as string | undefined

export function captchaChallengeUrl(): string | null {
  const base = (webUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) return null
  try {
    const parsed = new URL(base)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return `${parsed.origin}/auth/mobile-challenge`
  } catch {
    return null
  }
}

export function captchaBypassAllowed(): boolean {
  return __DEV__
}

export function parseChallengeToken(data: string): string | null {
  try {
    const message = JSON.parse(data) as { type?: unknown; token?: unknown }
    if (
      message.type === 'turnstile-token' &&
      typeof message.token === 'string' &&
      message.token
    ) {
      return message.token
    }
  } catch {
    // Ignore non-JSON messages from the page.
  }
  return null
}

export function isAllowedChallengeNavigation(url: string, allowedOrigin: string): boolean {
  try {
    return new URL(url).origin === allowedOrigin
  } catch {
    return false
  }
}
