import { describe, expect, it, vi } from 'vitest'
import { claimVoicePlayback, releaseVoicePlayback, replyPreviewForMessage, stopActiveVoicePlayback } from './voice-notes'

describe('voice-notes previews', () => {
  it('labels voice replies with duration', () => {
    expect(
      replyPreviewForMessage({ content: null, image_url: null, audio_url: 'c/m.m4a', audio_duration_sec: 42 }),
    ).toBe('Voice note (0:42)')
  })

  it('keeps image and GIF previews first', () => {
    expect(replyPreviewForMessage({ content: 'gif:https://x', image_url: null })).toBe('GIF')
    expect(replyPreviewForMessage({ content: null, image_url: 'c/i.webp' })).toBe('Image')
  })
})

describe('voice playback coordinator', () => {
  it('pauses the previous claimant and releases on demand', () => {
    const first = vi.fn()
    const second = vi.fn()
    claimVoicePlayback(first)
    claimVoicePlayback(second)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    releaseVoicePlayback(first)
    claimVoicePlayback(second)
    expect(first).toHaveBeenCalledTimes(1)
    stopActiveVoicePlayback()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
