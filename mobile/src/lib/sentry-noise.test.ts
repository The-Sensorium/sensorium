import type { ErrorEvent } from '@sentry/react-native'
import { describe, expect, it } from 'vitest'
import { isLiveKitAbortReasonNoise } from './sentry-noise'

function event(type: string | undefined, functions: Array<string | undefined>): ErrorEvent {
  return {
    exception: {
      values: [
        {
          type,
          stacktrace: { frames: functions.map((fn) => ({ function: fn })) },
        },
      ],
    },
  } as unknown as ErrorEvent
}

describe('isLiveKitAbortReasonNoise', () => {
  it('drops the upstream abort-reason TypeError', () => {
    expect(isLiveKitAbortReasonNoise(event('TypeError', ['tryCallTwo', 'getAbortReasonAsString']))).toBe(true)
  })

  it('keeps other TypeErrors', () => {
    expect(isLiveKitAbortReasonNoise(event('TypeError', ['tryCallTwo', 'statusOf']))).toBe(false)
  })

  it('keeps non-TypeErrors from the same function', () => {
    expect(isLiveKitAbortReasonNoise(event('RangeError', ['getAbortReasonAsString']))).toBe(false)
  })

  it('handles events without exception data', () => {
    expect(isLiveKitAbortReasonNoise({} as ErrorEvent)).toBe(false)
  })
})
