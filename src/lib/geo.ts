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
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            reject(new Error('Location permission was denied.'))
            break
          case err.POSITION_UNAVAILABLE:
            reject(new Error('Your location is currently unavailable.'))
            break
          default:
            reject(new Error('Unable to determine your location.'))
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  })
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
