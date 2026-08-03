import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPosition, reverseGeocode } from './geo'

describe('getCurrentPosition', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves the coordinates from the geolocation API', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (cb: PositionCallback) =>
          cb({
            coords: { latitude: 38.7223, longitude: -9.1393 },
          } as GeolocationPosition),
      },
    })
    await expect(getCurrentPosition()).resolves.toEqual({ lat: 38.7223, lng: -9.1393 })
  })

  it('rejects when geolocation is unsupported', async () => {
    vi.stubGlobal('navigator', {})
    await expect(getCurrentPosition()).rejects.toThrow(
      'Geolocation is not supported by your browser.',
    )
  })

  it('rejects with a permission-denied message', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_cb: PositionCallback, err: PositionErrorCallback) =>
          err({
            code: 1,
            message: 'denied',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
          } as GeolocationPositionError),
      },
    })
    await expect(getCurrentPosition()).rejects.toThrow('Location permission was denied.')
  })

  it('rejects with an unavailable message', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_cb: PositionCallback, err: PositionErrorCallback) =>
          err({
            code: 2,
            message: 'unavailable',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
          } as GeolocationPositionError),
      },
    })
    await expect(getCurrentPosition()).rejects.toThrow(
      'Your location is currently unavailable.',
    )
  })

  it('rejects with a fallback message for other errors', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_cb: PositionCallback, err: PositionErrorCallback) =>
          err({
            code: 3,
            message: 'timeout',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
          } as GeolocationPositionError),
      },
    })
    await expect(getCurrentPosition()).rejects.toThrow('Unable to determine your location.')
  })
})

describe('reverseGeocode', () => {
  const defaultFetch = vi.fn()

  beforeEach(() => {
    defaultFetch.mockReset()
    vi.stubGlobal('fetch', defaultFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('falls back to the coordinates slug when every source fails', async () => {
    defaultFetch.mockRejectedValue(new Error('network'))
    await expect(reverseGeocode({ lat: 38.7223, lng: -9.1393 })).resolves.toEqual({
      slug: '38-72-9-14',
      label: '38.72, -9.14',
    })
  })

  it('does not call the configured endpoint when unset', async () => {
    defaultFetch.mockRejectedValue(new Error('network'))
    await reverseGeocode({ lat: 1, lng: 2 })
    expect(defaultFetch).toHaveBeenCalledTimes(1)
    expect(String(defaultFetch.mock.calls[0][0])).toContain('bigdatacloud')
  })

  it('defaults to Your area when the response carries no label', async () => {
    defaultFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    await expect(reverseGeocode({ lat: 1.234, lng: 5.678 })).resolves.toEqual({
      slug: 'your-area',
      label: 'Your area',
    })
  })

  it('slugifies into a URL-safe key', async () => {
    defaultFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ locality: 'São Paulo!' }),
    } as Response)
    await expect(reverseGeocode({ lat: 1, lng: 2 })).resolves.toEqual({
      slug: 's-o-paulo',
      label: 'São Paulo!',
    })
  })
})

describe('reverseGeocode with a configured endpoint', () => {
  it('prefers the configured endpoint when it responds', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_GEOCODING_ENDPOINT', 'https://geo.example.test')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ city: 'Lisbon' }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)
    const { reverseGeocode } = await import('./geo')
    await expect(reverseGeocode({ lat: 1, lng: 2 })).resolves.toEqual({
      slug: 'lisbon',
      label: 'Lisbon',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://geo.example.test?latitude=1&longitude=2')
  })

  it('falls through to BigDataCloud when the configured endpoint fails', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_GEOCODING_ENDPOINT', 'https://geo.example.test')
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ city: 'Porto', countryName: 'Portugal' }),
      } as Response)
    vi.stubGlobal('fetch', fetchMock)
    const { reverseGeocode } = await import('./geo')
    await expect(reverseGeocode({ lat: 1, lng: 2 })).resolves.toEqual({
      slug: 'porto',
      label: 'Porto',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})
