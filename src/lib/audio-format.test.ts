import { describe, expect, it } from 'vitest'
import {
  extForVoiceMime,
  formatVoiceDuration,
  isAllowedVoiceMime,
  isValidVoiceDuration,
  normalizeVoiceMime,
  voiceNoteLabel,
} from './audio-format'

describe('audio-format', () => {
  it('formats durations as M:SS', () => {
    expect(formatVoiceDuration(0)).toBe('0:00')
    expect(formatVoiceDuration(7)).toBe('0:07')
    expect(formatVoiceDuration(42)).toBe('0:42')
    expect(formatVoiceDuration(120)).toBe('2:00')
    expect(formatVoiceDuration(null)).toBe('0:00')
  })

  it('labels voice replies with duration', () => {
    expect(voiceNoteLabel(42)).toBe('Voice note (0:42)')
    expect(voiceNoteLabel(120)).toBe('Voice note (2:00)')
  })

  it('validates the 1s to 120s range', () => {
    expect(isValidVoiceDuration(0)).toBe(false)
    expect(isValidVoiceDuration(1)).toBe(true)
    expect(isValidVoiceDuration(120)).toBe(true)
    expect(isValidVoiceDuration(121)).toBe(false)
    expect(isValidVoiceDuration(null)).toBe(false)
  })

  it('normalizes MIME variants and checks the allowlist', () => {
    expect(normalizeVoiceMime('audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4')
    expect(normalizeVoiceMime('audio/x-m4a')).toBe('audio/m4a')
    expect(isAllowedVoiceMime('audio/m4a')).toBe(true)
    expect(isAllowedVoiceMime('audio/wav')).toBe(false)
  })

  it('maps MIME to file extension', () => {
    expect(extForVoiceMime('audio/m4a')).toBe('m4a')
    expect(extForVoiceMime('audio/mp4')).toBe('m4a')
    expect(extForVoiceMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extForVoiceMime('audio/ogg')).toBe('ogg')
  })
})
