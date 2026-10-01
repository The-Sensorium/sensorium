export type OnboardingState = 'loading' | 'error' | 'complete' | 'incomplete'

export function resolveOnboardingState(input: {
  isLoading: boolean
  isError: boolean
  onboardingCompletedAt: string | null | undefined
}): OnboardingState {
  if (input.onboardingCompletedAt) return 'complete'
  if (input.isLoading) return 'loading'
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
