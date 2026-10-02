import type { ErrorEvent } from '@sentry/react-native'

/**
 * Drops a known upstream livekit-client error: getAbortReasonAsString runs
 * `'toString' in reason` with reason undefined when React Native's
 * AbortSignal drops abort() reasons. It throws while logging a
 * user-initiated disconnect; the disconnect itself completes, so this has
 * no user impact and no app code is involved. Matched on the throwing
 * function, not the message, so real `in`-operator bugs still report.
 */
export function isLiveKitAbortReasonNoise(event: ErrorEvent): boolean {
  const value = event.exception?.values?.[0]
  if (value?.type !== 'TypeError') return false
  return (value.stacktrace?.frames ?? []).some((frame) => frame.function === 'getAbortReasonAsString')
}
