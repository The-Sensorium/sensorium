import { describe, expect, it } from 'vitest'
import { isMobileDevice } from './device'

describe('isMobileDevice', () => {
  it('detects phone user agents', () => {
    expect(
      isMobileDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe(true)
    expect(
      isMobileDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      ),
    ).toBe(true)
  })

  it('treats desktop user agents as non-mobile', () => {
    expect(
      isMobileDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      ),
    ).toBe(false)
    expect(isMobileDevice('')).toBe(false)
  })
})
