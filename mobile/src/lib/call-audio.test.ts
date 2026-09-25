import { describe, expect, it, vi } from 'vitest'
import {
  callAudioConfig,
  earpieceOutputFor,
  hasExternalAudioOutputLive,
  hasExternalOutput,
  setSpeakerEnabled,
  setupCallAudio,
  speakerOutputFor,
  teardownCallAudio,
} from './call-audio'

describe('speakerOutputFor', () => {
  it('routes iOS to force_speaker and Android to speaker', () => {
    expect(speakerOutputFor('ios')).toBe('force_speaker')
    expect(speakerOutputFor('android')).toBe('speaker')
  })
})

describe('earpieceOutputFor', () => {
  it('routes iOS to default and Android to earpiece', () => {
    expect(earpieceOutputFor('ios')).toBe('default')
    expect(earpieceOutputFor('android')).toBe('earpiece')
  })
})

describe('callAudioConfig', () => {
  it('prefers speaker over earpiece with headsets first', () => {
    const config = callAudioConfig()
    expect(config.ios.defaultOutput).toBe('speaker')
    expect(config.android.preferredOutputList).toEqual([
      'bluetooth',
      'headset',
      'speaker',
      'earpiece',
    ])
  })
})

describe('hasExternalOutput', () => {
  it('detects bluetooth and wired headsets', () => {
    expect(hasExternalOutput(['bluetooth', 'speaker'])).toBe(true)
    expect(hasExternalOutput(['headset', 'speaker'])).toBe(true)
    expect(hasExternalOutput(['speaker', 'earpiece'])).toBe(false)
    expect(hasExternalOutput([])).toBe(false)
  })
})

describe('setupCallAudio', () => {
  it('configures and starts without pinning an output', async () => {
    const audioSession = {
      configureAudio: vi.fn().mockResolvedValue(undefined),
      startAudioSession: vi.fn().mockResolvedValue(undefined),
      selectAudioOutput: vi.fn().mockResolvedValue(undefined),
    }
    await setupCallAudio(audioSession)
    expect(audioSession.configureAudio).toHaveBeenCalledOnce()
    expect(audioSession.startAudioSession).toHaveBeenCalledOnce()
    expect(audioSession.selectAudioOutput).not.toHaveBeenCalled()
  })

  it('never throws when the native module fails', async () => {
    const audioSession = {
      configureAudio: vi.fn().mockRejectedValue(new Error('no audio')),
      startAudioSession: vi.fn().mockRejectedValue(new Error('no audio')),
    }
    await expect(setupCallAudio(audioSession)).resolves.toBeUndefined()
    await expect(teardownCallAudio(audioSession)).resolves.toBeUndefined()
  })
})

describe('hasExternalAudioOutputLive', () => {
  it('resolves null on iOS where devices are not reported', async () => {
    await expect(hasExternalAudioOutputLive('ios')).resolves.toBeNull()
  })

  it('resolves null on Android when the native module cannot load', async () => {
    await expect(hasExternalAudioOutputLive('android')).resolves.toBeNull()
  })
})

describe('setSpeakerEnabled', () => {
  it('toggles between speaker and earpiece outputs', async () => {
    const audioSession = { selectAudioOutput: vi.fn().mockResolvedValue(undefined) }
    await setSpeakerEnabled(true, 'android', audioSession)
    expect(audioSession.selectAudioOutput).toHaveBeenCalledWith('speaker')
    await setSpeakerEnabled(false, 'android', audioSession)
    expect(audioSession.selectAudioOutput).toHaveBeenCalledWith('earpiece')
    await setSpeakerEnabled(false, 'ios', audioSession)
    expect(audioSession.selectAudioOutput).toHaveBeenCalledWith('default')
  })

  it('re-configures the iOS default so speaker-off reaches the earpiece', async () => {
    const audioSession = {
      configureAudio: vi.fn().mockResolvedValue(undefined),
      selectAudioOutput: vi.fn().mockResolvedValue(undefined),
    }
    await setSpeakerEnabled(false, 'ios', audioSession)
    expect(audioSession.configureAudio).toHaveBeenCalledWith({ ios: { defaultOutput: 'earpiece' } })
    expect(audioSession.selectAudioOutput).toHaveBeenCalledWith('default')
    await setSpeakerEnabled(true, 'ios', audioSession)
    expect(audioSession.configureAudio).toHaveBeenCalledWith({ ios: { defaultOutput: 'speaker' } })
    expect(audioSession.selectAudioOutput).toHaveBeenCalledWith('force_speaker')
  })

  it('does not re-configure audio on Android', async () => {
    const audioSession = {
      configureAudio: vi.fn().mockResolvedValue(undefined),
      selectAudioOutput: vi.fn().mockResolvedValue(undefined),
    }
    await setSpeakerEnabled(false, 'android', audioSession)
    expect(audioSession.configureAudio).not.toHaveBeenCalled()
    expect(audioSession.selectAudioOutput).toHaveBeenCalledWith('earpiece')
  })
})
