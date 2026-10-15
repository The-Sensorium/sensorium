import { VOICE_WAVEFORM_BARS } from './audio-format'

export function normalizePeaks(peaks: readonly number[], bars = VOICE_WAVEFORM_BARS): number[] {
  const out: number[] = []
  if (peaks.length === 0 || bars <= 0) return out
  if (peaks.length === bars) return peaks.map((p) => clampPeak(p))
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * peaks.length) / bars)
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / bars))
    let max = 0
    for (let j = start; j < end; j++) max = Math.max(max, Math.abs(peaks[j] ?? 0))
    out.push(clampPeak(max))
  }
  return out
}

export function decodeStoredWaveform(raw: unknown, bars = VOICE_WAVEFORM_BARS): number[] | null {
  if (!Array.isArray(raw)) return null
  const nums = raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (nums.length === 0) return null
  return normalizePeaks(nums, bars)
}

export function peaksFromAnalyserByteData(data: ArrayLike<number>): number {
  let max = 0
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(((data[i] ?? 128) - 128) / 128)
    if (v > max) max = v
  }
  return clampPeak(max)
}

function clampPeak(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0.02, v))
}
