import { describe, expect, it } from 'vitest'
import {
  homeListError,
  isProfileMissingError,
  ProfileMissingError,
  resolveOnboardingState,
  resolveProfileData,
  shouldShowFresh,
} from './home-gating'
import { isPermanentQueryError } from './query-retry'

describe('resolveProfileData', () => {
  it('returns the row when present', () => {
    expect(resolveProfileData({ id: 'u1' }, null)).toEqual({ id: 'u1' })
  })

  it('rethrows query errors unchanged', () => {
    const failure = new Error('network down')
    expect(() => resolveProfileData(null, failure)).toThrow(failure)
  })

  it('throws ProfileMissingError on an empty success so it is retried, never routed on', () => {
    expect(() => resolveProfileData(null, null)).toThrow(ProfileMissingError)
    expect(() => resolveProfileData(undefined, null)).toThrow(ProfileMissingError)
  })

  it('identifies the missing error', () => {
    expect(isProfileMissingError(new ProfileMissingError())).toBe(true)
    expect(isProfileMissingError(new Error('other'))).toBe(false)
    expect(isProfileMissingError(null)).toBe(false)
  })

  it('identifies a duck-typed missing error across realms', () => {
    const dupe = new Error('Profile not found')
    dupe.name = 'ProfileMissingError'
    expect(isProfileMissingError(dupe)).toBe(true)
  })

  it('stays retryable under the global retry classifier', () => {
    expect(isPermanentQueryError(new ProfileMissingError())).toBe(false)
  })
})

describe('resolveOnboardingState', () => {
  it('reports complete when the timestamp is set, even on a background refetch error', () => {
    expect(
      resolveOnboardingState({
        isLoading: false,
        isError: true,
        profileMissing: false,
        onboardingCompletedAt: '2026-01-01T00:00:00Z',
      }),
    ).toBe('complete')
  })

  it('reports loading while the first fetch is in flight', () => {
    expect(
      resolveOnboardingState({
        isLoading: true,
        isError: false,
        profileMissing: false,
        onboardingCompletedAt: undefined,
      }),
    ).toBe('loading')
  })

  it('reports error instead of incomplete when the fetch fails with no data', () => {
    expect(
      resolveOnboardingState({
        isLoading: false,
        isError: true,
        profileMissing: false,
        onboardingCompletedAt: undefined,
      }),
    ).toBe('error')
  })

  it('reports incomplete for a missing row after retries so onboarding can bootstrap it', () => {
    expect(
      resolveOnboardingState({
        isLoading: false,
        isError: true,
        profileMissing: true,
        onboardingCompletedAt: undefined,
      }),
    ).toBe('incomplete')
  })

  it('reports incomplete for a loaded profile without a timestamp', () => {
    expect(
      resolveOnboardingState({
        isLoading: false,
        isError: false,
        profileMissing: false,
        onboardingCompletedAt: null,
      }),
    ).toBe('incomplete')
  })

  it('reports incomplete when there is no row and no error', () => {
    expect(
      resolveOnboardingState({
        isLoading: false,
        isError: false,
        profileMissing: false,
        onboardingCompletedAt: undefined,
      }),
    ).toBe('incomplete')
  })
})

describe('shouldShowFresh', () => {
  it('shows the get-started steps for a genuinely fresh account', () => {
    expect(
      shouldShowFresh({
        loading: false,
        listFailed: false,
        hasClusters: false,
        hasInvites: false,
        hasFormed: false,
      }),
    ).toBe(true)
  })

  it('hides the steps while any list is still loading', () => {
    expect(
      shouldShowFresh({
        loading: true,
        listFailed: false,
        hasClusters: false,
        hasInvites: false,
        hasFormed: false,
      }),
    ).toBe(false)
  })

  it('hides the steps when a list fetch failed instead of mimicking a new user', () => {
    expect(
      shouldShowFresh({
        loading: false,
        listFailed: true,
        hasClusters: false,
        hasInvites: false,
        hasFormed: false,
      }),
    ).toBe(false)
  })

  it('hides the steps when the user has clusters or invites', () => {
    expect(
      shouldShowFresh({
        loading: false,
        listFailed: false,
        hasClusters: true,
        hasInvites: false,
        hasFormed: false,
      }),
    ).toBe(false)
    expect(
      shouldShowFresh({
        loading: false,
        listFailed: false,
        hasClusters: false,
        hasInvites: true,
        hasFormed: false,
      }),
    ).toBe(false)
  })

  it('hides the steps when a cluster-formed banner is pending', () => {
    expect(
      shouldShowFresh({
        loading: false,
        listFailed: false,
        hasClusters: false,
        hasInvites: false,
        hasFormed: true,
      }),
    ).toBe(false)
  })
})

describe('homeListError', () => {
  it('returns an empty message when nothing failed', () => {
    expect(homeListError({ clustersError: false, invitationsError: false, formedError: false })).toBe(
      '',
    )
  })

  it('surfaces cluster, invitation, and banner failures', () => {
    expect(homeListError({ clustersError: true, invitationsError: false, formedError: false })).toBe(
      'Couldn’t load your clusters.',
    )
    expect(homeListError({ clustersError: false, invitationsError: true, formedError: false })).toBe(
      'Couldn’t load your invitations.',
    )
    expect(homeListError({ clustersError: false, invitationsError: false, formedError: true })).toBe(
      'Couldn’t load your latest updates.',
    )
  })
})
