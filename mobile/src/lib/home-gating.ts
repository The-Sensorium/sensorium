// profile-missing.ts is generated from the web copy by sync:db-types.
// Re-exported here so existing import sites keep working.
export {
  isProfileMissingError,
  ProfileMissingError,
  resolveProfileData,
} from './profile-missing'

export type OnboardingState = 'loading' | 'error' | 'complete' | 'incomplete'

export function resolveOnboardingState(input: {
  // isPending, not isLoading: isLoading is isFetching && isPending, so it
  // drops during retry backoff and offline pauses while there is still no
  // data. Gating on it mistakes those windows for "not onboarded" and
  // bounces onboarded users to onboarding on slow connections.
  isPending: boolean
  isError: boolean
  profileMissing: boolean
  onboardingCompletedAt: string | null | undefined
}): OnboardingState {
  if (input.onboardingCompletedAt) return 'complete'
  if (input.isPending) return 'loading'
  if (input.profileMissing) return 'incomplete'
  // A loaded row with a null timestamp is known incomplete: route it to
  // onboarding even when a background refetch errored.
  if (input.onboardingCompletedAt === null) return 'incomplete'
  if (input.isError) return 'error'
  return 'incomplete'
}

export function homeListError(input: {
  clustersError: boolean
  invitationsError: boolean
  formedError: boolean
}): string {
  if (input.clustersError) return 'Couldn’t load your clusters.'
  if (input.invitationsError) return 'Couldn’t load your invitations.'
  if (input.formedError) return 'Couldn’t load your latest updates.'
  return ''
}

export function shouldShowFresh(input: {
  loading: boolean
  listFailed: boolean
  hasClusters: boolean
  hasInvites: boolean
  hasFormed: boolean
}): boolean {
  return (
    !input.loading &&
    !input.listFailed &&
    !input.hasClusters &&
    !input.hasInvites &&
    !input.hasFormed
  )
}
