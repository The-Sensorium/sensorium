export interface GeoPoint {
  lat: number
  lng: number
}

export interface Place {
  slug: string
  label: string
}

/** Promise wrapper around the browser Geolocation API. */
export function getCurrentPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by your browser.'))
      return
    }
    // kCLErrorLocationUnknown surfaces as POSITION_UNAVAILABLE and is transient:
    // CoreLocation may fail the first fix even when permission is granted
    // (seen on macOS Tahoe + Edge). TIMEOUT is transient for the same reason.
    // Retry once with low accuracy, which uses network-based positioning
    // instead of the failing high-accuracy provider.
    const attempts: PositionOptions[] = [
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    ]
    let attempt = 0
    const run = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          if (isTransient(err) && attempt + 1 < attempts.length) {
            attempt += 1
            run()
            return
          }
          reject(toGeoError(err))
        },
        attempts[attempt],
      )
    }
    run()
  })
}

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const TIMEOUT = 3

function isTransient(err: GeolocationPositionError): boolean {
  return err.code === POSITION_UNAVAILABLE || err.code === TIMEOUT
}

function toGeoError(err: GeolocationPositionError): Error {
  switch (err.code) {
    case PERMISSION_DENIED:
      return new Error('Location permission was denied.')
    case POSITION_UNAVAILABLE:
      return new Error('Your location is currently unavailable.')
    default:
      return new Error('Unable to determine your location.')
  }
}

const GEOCODING_ENDPOINT = import.meta.env.VITE_GEOCODING_ENDPOINT as string | undefined

/**
 * Resolves a location label + slug for local matching.
 * 1) configured VITE_GEOCODING_ENDPOINT, 2) keyless BigDataCloud, 3) coords fallback.
 */
export async function reverseGeocode(point: GeoPoint): Promise<Place> {
  if (GEOCODING_ENDPOINT) {
    try {
      const res = await fetch(`${GEOCODING_ENDPOINT}?latitude=${point.lat}&longitude=${point.lng}`)
      if (res.ok) {
        const data = await res.json()
        const label = data.locality || data.city || data.region || data.country || 'Your area'
        return { slug: slugify(label), label }
      }
    } catch {
      // fall through to the next source
    }
  }

  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${point.lat}&longitude=${point.lng}&localityLanguage=en`,
    )
    if (res.ok) {
      const data = await res.json()
      const label =
        data.locality || data.city || data.principalSubdivision || data.countryName || 'Your area'
      return { slug: slugify(label), label }
    }
  } catch {
    // fall through to the coords fallback
  }

  const label = `${point.lat.toFixed(2)}, ${point.lng.toFixed(2)}`
  return { slug: slugify(label), label }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
