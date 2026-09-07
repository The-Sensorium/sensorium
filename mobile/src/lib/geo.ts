export interface GeoPoint {
  lat: number
  lng: number
}

export interface Place {
  slug: string
  label: string
}

export async function getCurrentPosition(): Promise<GeoPoint> {
  const Location = await import('expo-location')
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') throw new Error('Location permission was denied.')
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
  return { lat: pos.coords.latitude, lng: pos.coords.longitude }
}

const GEOCODING_ENDPOINT = process.env.EXPO_PUBLIC_GEOCODING_ENDPOINT as string | undefined

/**
 * Resolves a location label + slug for local matching.
 * 1) configured EXPO_PUBLIC_GEOCODING_ENDPOINT, 2) keyless BigDataCloud, 3) coords fallback.
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
