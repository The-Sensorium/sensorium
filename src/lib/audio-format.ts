export const VOICE_MAX_SEC = 120
export const VOICE_MIN_SEC = 1
export const VOICE_MAX_BYTES = 5 * 1024 * 1024
export const VOICE_WAVEFORM_BARS = 56

export const VOICE_ALLOWED_MIMES = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
])

const WEB_MIME_PROBE_ORDER = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/m4a',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
]

export function probeWebRecordingMime(): string {
  const MR = (
    globalThis as unknown as {
      MediaRecorder?: { isTypeSupported?: (type: string) => boolean }
    }
  ).MediaRecorder
  if (!MR || typeof MR.isTypeSupported !== 'function') return ''
  for (const candidate of WEB_MIME_PROBE_ORDER) {
    try {
      if (MR.isTypeSupported(candidate)) return candidate
    } catch {
      // ignore probe failures and try the next candidate
    }
  }
  return ''
}

export function normalizeVoiceMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'audio/x-m4a') return 'audio/m4a'
  if (base === 'audio/x-mp4') return 'audio/mp4'
  return base
}

export function isAllowedVoiceMime(mime: string): boolean {
  return VOICE_ALLOWED_MIMES.has(normalizeVoiceMime(mime))
}

export function extForVoiceMime(mime: string): string {
  const base = normalizeVoiceMime(mime)
  if (base === 'audio/m4a' || base === 'audio/aac') return 'm4a'
  if (base === 'audio/mp4') return 'm4a'
  if (base === 'audio/webm') return 'webm'
  if (base === 'audio/ogg') return 'ogg'
  if (base === 'audio/mpeg') return 'mp3'
  return 'm4a'
}

export function formatVoiceDuration(totalSec: number | null | undefined): string {
  const sec = Math.max(0, Math.round(totalSec ?? 0))
  const m = Math.floor(sec / 60)
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

export function voiceNoteLabel(durationSec: number | null | undefined): string {
  return `Voice note (${formatVoiceDuration(durationSec)})`
}

export function isValidVoiceDuration(sec: number | null | undefined): boolean {
  return (
    typeof sec === 'number' &&
    Number.isFinite(sec) &&
    Math.round(sec) >= VOICE_MIN_SEC &&
    Math.round(sec) <= VOICE_MAX_SEC
  )
}
