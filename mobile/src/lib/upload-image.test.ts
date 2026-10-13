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

import {
  AVATAR_FULL_MAX_DIMENSION,
  AVATAR_THUMB_MAX_DIMENSION,
  maybeResize,
  newStorageId,
  prepareAvatarPair,
  validateAvatarAsset,
} from './upload-image'

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

describe('validateAvatarAsset', () => {  it('accepts JPG, PNG, WebP, and GIF', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(validateAvatarAsset(mime, 100)).toBeNull()
    }
  })

  it('calls out HEIC explicitly', () => {
    expect(validateAvatarAsset('image/heic', 100)).toBe(
      'Please choose a JPG, PNG, WebP, or GIF image (HEIC is not supported yet).',
    )
  })

  it('rejects oversized assets', () => {
    expect(validateAvatarAsset('image/jpeg', 5 * 1024 * 1024 + 1)).toBe(
      'That image is larger than 5 MB.',
    )
  })
})

describe('prepareAvatarPair', () => {
  it('returns the same uri for GIFs and small images', async () => {
    await expect(prepareAvatarPair('u', 'image/gif', 4000, 3000)).resolves.toEqual({
      fullUri: 'u',
      fullMime: 'image/gif',
      thumbUri: 'u',
      thumbMime: 'image/gif',
    })
    await expect(prepareAvatarPair('u', 'image/jpeg', 200, 200)).resolves.toEqual({
      fullUri: 'u',
      fullMime: 'image/jpeg',
      thumbUri: 'u',
      thumbMime: 'image/jpeg',
    })
    expect(manipulateAsync).not.toHaveBeenCalled()
    expect(AVATAR_FULL_MAX_DIMENSION).toBe(1024)
    expect(AVATAR_THUMB_MAX_DIMENSION).toBe(256)
  })

  it('builds full 1024 plus thumb 256 for large photos', async () => {
    manipulateAsync
      .mockResolvedValueOnce({ uri: 'full-out', width: 1024, height: 512 })
      .mockResolvedValueOnce({ uri: 'thumb-out', width: 256, height: 128 })
    const pair = await prepareAvatarPair('u', 'image/jpeg', 2048, 1024)
    expect(pair).toEqual({
      fullUri: 'full-out',
      fullMime: 'image/webp',
      thumbUri: 'thumb-out',
      thumbMime: 'image/webp',
    })
    expect(manipulateAsync).toHaveBeenNthCalledWith(
      1,
      'u',
      [{ resize: { width: 1024 } }],
      expect.anything(),
    )
    expect(manipulateAsync).toHaveBeenNthCalledWith(
      2,
      'full-out',
      [{ resize: { width: 256 } }],
      expect.anything(),
    )
  })

  it('keeps the original as full and resizes only the thumb for mid-size photos', async () => {
    manipulateAsync.mockResolvedValue({ uri: 'thumb-out', width: 256, height: 256 })
    const pair = await prepareAvatarPair('u', 'image/jpeg', 800, 800)
    expect(pair.fullUri).toBe('u')
    expect(pair.thumbUri).toBe('thumb-out')
    expect(manipulateAsync).toHaveBeenCalledTimes(1)
  })
})

describe('newStorageId', () => {
  it('falls back when globalThis.crypto is missing (Android Hermes)', () => {
    vi.stubGlobal('crypto', undefined)
    try {
      const id = newStorageId()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
