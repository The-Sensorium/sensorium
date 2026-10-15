import { File as ExpoFile } from 'expo-file-system'
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy'
import { requireSupabase } from './supabase'
import { VOICE_MAX_BYTES, isAllowedVoiceMime } from './audio-format'

export { newStorageId } from './upload-image'

const READ_TIMEOUT_MS = 30_000
const PATH_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.[a-z0-9]+$/

function assertStoragePath(path: string): void {
  if (!PATH_RE.test(path) || path.includes('..')) throw new Error('Invalid upload destination.')
}

async function localFileUri(uri: string): Promise<string> {
  if (uri.startsWith('file://')) return uri
  const dest = `${cacheDirectory}voice-${Date.now()}.tmp`
  await copyAsync({ from: uri, to: dest })
  return dest
}

export async function readAudioBytes(uri: string): Promise<ArrayBuffer> {
  const local = await localFileUri(uri)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const buffer = await Promise.race([
      new ExpoFile(local).arrayBuffer(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Reading that voice note timed out. Try again.')), READ_TIMEOUT_MS)
      }),
    ])
    if (buffer.byteLength === 0) throw new Error('Could not read that voice note. Try again.')
    if (buffer.byteLength > VOICE_MAX_BYTES) {
      throw new Error('Voice notes must be 5 MB or smaller.')
    }
    return buffer
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function uploadAudioBytes(
  bucket: string,
  path: string,
  uri: string,
  mime: string,
): Promise<void> {
  if (bucket !== 'voice-notes') throw new Error('Invalid upload destination.')
  assertStoragePath(path)
  if (!isAllowedVoiceMime(mime)) throw new Error('Unsupported audio format.')
  const supabase = requireSupabase()
  const body = await readAudioBytes(uri)
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
}
