import { describe, expect, it } from 'vitest'
import { decodeStoredWaveform, normalizePeaks, peaksFromAnalyserByteData } from './audio-waveform'

describe('audio-waveform', () => {
  it('downsamples peaks to the requested bar count', () => {
    const peaks = normalizePeaks([0, 0.5, 1, 0.25], 2)
    expect(peaks).toHaveLength(2)
    expect(peaks[0]).toBeGreaterThan(0)
    expect(peaks[1]).toBeGreaterThan(0)
  })

  it('decodes stored arrays and rejects junk', () => {
    expect(decodeStoredWaveform([0.1, 0.5, 0.9], 3)).toHaveLength(3)
    expect(decodeStoredWaveform('nope')).toBeNull()
    expect(decodeStoredWaveform([])).toBeNull()
    expect(decodeStoredWaveform([0.2, 'x', null], 2)).toHaveLength(2)
  })

  it('derives a peak from analyser bytes', () => {
    expect(peaksFromAnalyserByteData([128, 128, 128])).toBeGreaterThanOrEqual(0)
    expect(peaksFromAnalyserByteData([255, 128, 0])).toBeGreaterThan(0.5)
  })
})
