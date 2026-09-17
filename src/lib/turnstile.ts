export function turnstileSiteKey(): string {
  return ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '').trim()
}
