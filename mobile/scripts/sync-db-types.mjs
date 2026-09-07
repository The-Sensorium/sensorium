import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const from = (f) => join(root, 'src', 'lib', f)
const to = (f) => join(root, 'mobile', 'src', 'lib', f)
copyFileSync(from('database.types.ts'), to('database.types.ts'))
for (const f of ['availability.ts', 'countries.ts', 'constants.ts', 'error.ts', 'utils.ts', 'query-retry.ts']) {
  copyFileSync(from(f), to(f))
}
for (const f of ['matching.ts', 'discovery.ts', 'introductions.ts', 'votes.ts', 'signals.ts', 'moderation.ts', 'mentions.ts', 'access.ts', 'appeals.ts']) {
  const src = readFileSync(join(root, 'src', 'features', f), 'utf8').replaceAll(
    "from '../app/auth-context'",
    "from '../auth-context'",
  )
  writeFileSync(join(root, 'mobile', 'src', 'features', f), src)
}

{
  const web = readFileSync(join(root, 'src', 'features', 'notifications.ts'), 'utf8')
    .replaceAll("from '../app/auth-context'", "from '../auth-context'")
    .replaceAll('timeFormatter.format(', 'formatRelative(')
    .replace(
      "const timeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })",
      [
        'function getTimeFormatter(): Intl.RelativeTimeFormat | null {',
        '  try {',
        "    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })",
        '  } catch {',
        '    return null',
        '  }',
        '}',
        'const timeFormatter = getTimeFormatter()',
        '',
        'function formatRelative(value: number, unit: Intl.RelativeTimeFormatUnit): string {',
        '  if (timeFormatter) return timeFormatter.format(value, unit)',
        '  const abs = Math.abs(value)',
        "  const label = unit === 'minute' ? 'min' : unit",
        "  return abs + ' ' + label + (abs === 1 ? '' : 's') + ' ago'",
        '}',
      ].join('\n'),
    )
  if (web.includes('timeFormatter.format(-') || web.includes('const timeFormatter = new Intl')) {
    throw new Error('notifications RelativeTimeFormat transform failed')
  }
  writeFileSync(join(root, 'mobile', 'src', 'features', 'notifications.ts'), web)
}

const rnUploads = [
  {
    file: 'cluster.ts',
    anchor: '/chat-images',
    replacement: [
      "import { extFor, maybeResize, storagePath, uploadImageBytes } from '../lib/upload-image'",
      '',
      '/** Upload an image to the cluster\'s chat-images bucket; returns the storage path. */',
      'export async function uploadChatImage(',
      '  clusterId: string,',
      '  uri: string,',
      '  mime: string,',
      '  width: number,',
      '  height: number,',
      '): Promise<string> {',
      '  const final = await maybeResize(uri, mime, width, height, 1600)',
      '  const path = storagePath(clusterId, extFor(final.mime))',
      "  await uploadImageBytes('chat-images', path, final.uri, final.mime)",
      '  return path',
      '}',
    ].join('\n'),
  },
  {
    file: 'posts.ts',
    anchor: '/posts-images',
    replacement: [
      "import { extFor, maybeResize, storagePath, uploadImageBytes } from '../lib/upload-image'",
      '',
      "/** Upload an image to the cluster's posts-images bucket; returns the storage path. */",
      'export async function uploadPostImage(',
      '  clusterId: string,',
      '  uri: string,',
      '  mime: string,',
      '  width: number,',
      '  height: number,',
      '): Promise<string> {',
      '  const final = await maybeResize(uri, mime, width, height, 1600)',
      '  const path = storagePath(clusterId, extFor(final.mime))',
      "  await uploadImageBytes('posts-images', path, final.uri, final.mime)",
      '  return path',
      '}',
    ].join('\n'),
  },
]
for (const { file, anchor, replacement } of rnUploads) {
  const web = readFileSync(join(root, 'src', 'features', file), 'utf8')
    .replaceAll("from '../app/auth-context'", "from '../auth-context'")
    .replace("import { prepareImage } from '../lib/image'", '')
    .replace(
      new RegExp('/\\*\\* Upload an image to the cluster[^]*?\\n\\}', ''),
      replacement,
    )
  if (!web.includes(anchor) || web.includes('prepareImage')) {
    throw new Error('upload transform failed for ' + file)
  }
  writeFileSync(join(root, 'mobile', 'src', 'features', file), web)
}

// realtime.ts is PINNED (mobile divergence: ref-counted useClusterChannel for
// tab-kept-mounted screens). Reconcile by hand if the web copy changes.
{
  const pinned = readFileSync(join(root, 'mobile', 'src', 'features', 'realtime.ts'), 'utf8')
  if (!pinned.includes('clusterChannelEntries')) {
    throw new Error('realtime.ts pin lost: ref-count registry missing')
  }
}
{
  const web = readFileSync(join(root, 'src', 'features', 'gifs.ts'), 'utf8')
    .replaceAll('import.meta.env.VITE_KLIPY_APP_KEY', 'process.env.EXPO_PUBLIC_KLIPY_APP_KEY')
    .replaceAll('import.meta.env.VITE_KLIPY_ENDPOINT', 'process.env.EXPO_PUBLIC_KLIPY_ENDPOINT')
  if (web.includes('import.meta.env')) throw new Error('gifs transform failed')
  writeFileSync(join(root, 'mobile', 'src', 'features', 'gifs.ts'), web)
}
let modes = readFileSync(from('modes.ts'), 'utf8').replaceAll("from 'lucide-react'", "from 'lucide-react-native'")
writeFileSync(to('modes.ts'), modes)
let geo = readFileSync(from('geo.ts'), 'utf8')
  .replace(
    /\/\*\* Promise wrapper around the browser Geolocation API\. \*\/[\s\S]*?^\}/m,
    `export async function getCurrentPosition(): Promise<GeoPoint> {
  const Location = await import('expo-location')
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') throw new Error('Location permission was denied.')
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
  return { lat: pos.coords.latitude, lng: pos.coords.longitude }
}`,
  )
  .replaceAll('import.meta.env.VITE_GEOCODING_ENDPOINT', 'process.env.EXPO_PUBLIC_GEOCODING_ENDPOINT')
  .replaceAll('VITE_GEOCODING_ENDPOINT', 'EXPO_PUBLIC_GEOCODING_ENDPOINT')
writeFileSync(to('geo.ts'), geo)
console.log('synced database.types.ts + pure lib helpers from web src/lib (modes/geo adapted for RN)')
