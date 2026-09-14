import { describe, expect, it } from 'vitest'
import { isNetworkError, joinQueueErrorMessage, toErrorMessage } from './error'

describe('toErrorMessage', () => {
  it('returns the message from an Error instance', () => {
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('returns the fallback when an Error message is blank', () => {
    expect(toErrorMessage(new Error(''), 'fallback')).toBe('fallback')
  })

  it('reads .message from plain objects like PostgrestError', () => {
    expect(toErrorMessage({ message: 'relation does not exist', code: '42P01' }, 'fallback')).toBe(
      'relation does not exist',
    )
  })

  it('falls back for objects without a string message', () => {
    expect(toErrorMessage({ code: '42P01' }, 'fallback')).toBe('fallback')
    expect(toErrorMessage({ message: 42 }, 'fallback')).toBe('fallback')
  })

  it('trims and passes through strings', () => {
    expect(toErrorMessage('  oops  ', 'fallback')).toBe('oops')
    expect(toErrorMessage('', 'fallback')).toBe('fallback')
    expect(toErrorMessage('  ', 'fallback')).toBe('fallback')
  })

  it('returns the fallback for other values', () => {
    expect(toErrorMessage(null, 'fallback')).toBe('fallback')
    expect(toErrorMessage(undefined, 'fallback')).toBe('fallback')
    expect(toErrorMessage(42, 'fallback')).toBe('fallback')
  })

  it('returns the fallback for network errors instead of leaking raw text', () => {
    expect(toErrorMessage(new Error('Network request failed'), 'fallback')).toBe('fallback')
    expect(toErrorMessage(new Error('fetch failed: java.net.ConnectException'), 'fallback')).toBe(
      'fallback',
    )
    expect(toErrorMessage('Error: fetch failed: ECONNREFUSED', 'fallback')).toBe('fallback')
    expect(toErrorMessage({ message: 'Load failed' }, 'fallback')).toBe('fallback')
  })
})

describe('isNetworkError', () => {
  it('detects connectivity failures across shapes', () => {
    expect(isNetworkError(new Error('Network request failed'))).toBe(true)
    expect(isNetworkError('fetch failed')).toBe(true)
    expect(isNetworkError({ message: 'Failed to connect to /192.168.1.1:54601' })).toBe(true)
    expect(isNetworkError(new Error('You are offline'))).toBe(true)
  })

  it('ignores application errors', () => {
    expect(isNetworkError(new Error('relation does not exist'))).toBe(false)
    expect(isNetworkError('cooldown active')).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('joinQueueErrorMessage', () => {
  it('maps cooldown errors', () => {
    expect(joinQueueErrorMessage({ message: 'JOIN_COOLDOWN_ACTIVE' })).toContain('cooldown')
    expect(joinQueueErrorMessage(new Error('cooldown'))).toContain('cooldown')
  })

  it('maps missing-location errors', () => {
    expect(joinQueueErrorMessage({ message: 'location_not_set' })).toContain('radius')
    expect(joinQueueErrorMessage({ message: 'set your local radius first' })).toContain('radius')
  })

  it('maps already-in-cluster errors', () => {
    expect(joinQueueErrorMessage({ message: 'already_in_cluster' })).toContain('cluster')
    expect(joinQueueErrorMessage({ message: 'you are already in a cluster' })).toContain('cluster')
  })

  it('maps already-in-queue errors', () => {
    expect(joinQueueErrorMessage({ message: 'already_in_queue' })).toContain('queue')
  })

  it('maps onboarding-complete errors', () => {
    expect(joinQueueErrorMessage({ message: 'complete onboarding first' })).toContain('onboarding')
  })

  it('falls back for unrecognized errors', () => {
    expect(joinQueueErrorMessage({ message: 'unexpected database state' })).toContain(
      'Something went wrong while joining.',
    )
  })
})
