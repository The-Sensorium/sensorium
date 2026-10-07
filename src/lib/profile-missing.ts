/**
 * Thrown when a signed-in user's profile row reads back empty. Every auth
 * user gets a row from the handle_new_user trigger, and an unauthenticated
 * read fails loudly (42501, no table grant for anon), so an empty success
 * means the request was authenticated as someone else or the row is missing:
 * never proof the user is new. It carries no PostgREST code, so the global
 * retry budget applies and a refetch heals the transient case; a truly
 * missing row still settles here and routes to onboarding, whose submit
 * bootstraps it via upsert. The empty-success shape itself is proven in
 * tests/integration/profile-visibility.test.ts.
 */
export class ProfileMissingError extends Error {
  constructor() {
    super('Profile not found')
    this.name = 'ProfileMissingError'
  }
}

export function isProfileMissingError(error: unknown): boolean {
  if (error instanceof ProfileMissingError) return true
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ProfileMissingError'
  )
}

export function resolveProfileData<T>(data: T | null | undefined, error: unknown): T {
  if (error) throw error
  if (data == null) throw new ProfileMissingError()
  return data
}
