import { beforeEach, describe, expect, it, vi } from 'vitest'

const manipulateAsync = vi.fn()
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => manipulateAsync(...args),
  SaveFormat: { WEBP: 'webp' },
}))

vi.mock('expo-file-system', () => ({
  File: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  copyAsync: vi.fn(),
}))

vi.mock('./supabase', () => ({
  requireSupabase: vi.fn(),
}))

import { maybeResize } from './upload-image'

beforeEach(() => {
  manipulateAsync.mockReset()
})

describe('maybeResize', () => {
  it('leaves gifs untouched', async () => {
    await expect(maybeResize('u', 'image/gif', 4000, 3000, 1600)).resolves.toEqual({
      uri: 'u',
      mime: 'image/gif',
    })
    expect(manipulateAsync).not.toHaveBeenCalled()
  })

  it('leaves small images untouched', async () => {
    await expect(maybeResize('u', 'image/jpeg', 800, 600, 1600)).resolves.toEqual({
      uri: 'u',
      mime: 'image/jpeg',
    })
    expect(manipulateAsync).not.toHaveBeenCalled()
  })

  it('resizes landscape by width', async () => {
    manipulateAsync.mockResolvedValue({ uri: 'out', width: 1600, height: 900 })
    await expect(maybeResize('u', 'image/jpeg', 3200, 1800, 1600)).resolves.toEqual({
      uri: 'out',
      mime: 'image/webp',
    })
    expect(manipulateAsync).toHaveBeenCalledWith('u', [{ resize: { width: 1600 } }], expect.anything())
  })

  it('resizes portrait by height', async () => {
    manipulateAsync.mockResolvedValue({ uri: 'out', width: 900, height: 1600 })
    await expect(maybeResize('u', 'image/jpeg', 1080, 2400, 1600)).resolves.toEqual({
      uri: 'out',
      mime: 'image/webp',
    })
    expect(manipulateAsync).toHaveBeenCalledWith('u', [{ resize: { height: 1600 } }], expect.anything())
  })

  it('falls back to the original when the manipulator throws', async () => {
    manipulateAsync.mockRejectedValue(new Error('oom'))
    await expect(maybeResize('u', 'image/jpeg', 1080, 2400, 1600)).resolves.toEqual({
      uri: 'u',
      mime: 'image/jpeg',
    })
  })

  it('falls back when the manipulator returns an invalid frame', async () => {
    manipulateAsync.mockResolvedValue({ uri: 'out', width: 1600, height: 0 })
    await expect(maybeResize('u', 'image/jpeg', 3200, 1800, 1600)).resolves.toEqual({
      uri: 'u',
      mime: 'image/jpeg',
    })
  })

  it('leaves images with unknown dimensions untouched', async () => {
    await expect(maybeResize('u', 'image/jpeg', 0, 0, 1600)).resolves.toEqual({
      uri: 'u',
      mime: 'image/jpeg',
    })
    expect(manipulateAsync).not.toHaveBeenCalled()
  })
})
