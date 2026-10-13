import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AVATAR_FULL_MAX_DIMENSION,
  AVATAR_THUMB_MAX_DIMENSION,
  prepareAvatarVariants,
  prepareImage,
  validateAvatarFile,
} from './image'

describe('prepareImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function makeFile(name: string, type: string, size = 100): File {
    return new File([new Uint8Array(size)], name, { type })
  }

  it('returns animated GIFs untouched', async () => {
    const file = makeFile('cat.gif', 'image/gif')
    await expect(prepareImage(file)).resolves.toBe(file)
  })

  it('returns non-resizable formats untouched', async () => {
    const file = makeFile('doc.svg', 'image/svg+xml')
    await expect(prepareImage(file)).resolves.toBe(file)
  })

  it('returns the original when createImageBitmap is unavailable', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg')
    const result = await prepareImage(file)
    expect(result).toBe(file)
  })

  it('returns the original when createImageBitmap throws', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('decode failed')),
    )
    const file = makeFile('photo.jpg', 'image/jpeg')
    await expect(prepareImage(file)).resolves.toBe(file)
  })

  it('returns images already at or below maxDimension untouched', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 200, height: 100, close: vi.fn() }),
    )
    const file = makeFile('photo.jpg', 'image/jpeg')
    await expect(prepareImage(file)).resolves.toBe(file)
  })

  it('downscales large images and re-encodes to WebP', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 2048, height: 1024, close }),
    )
    const drawImage = vi.fn()
    const ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
      drawImage,
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(['webp'], { type: 'image/webp' }))
      return undefined as unknown as Blob
    })

    const file = makeFile('photo.JPG', 'image/jpeg')
    const result = await prepareImage(file, { maxDimension: 512 })

    expect(result.type).toBe('image/webp')
    expect(result.name).toBe('photo.webp')
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      512,
      256,
    )
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('returns the original when the canvas has no 2d context', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 2048, height: 1024, close: vi.fn() }),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const file = makeFile('photo.jpg', 'image/jpeg')
    await expect(prepareImage(file)).resolves.toBe(file)
  })

  it('returns the original when canvas toBlob yields nothing', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 2048, height: 1024, close: vi.fn() }),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(null)
      return undefined as unknown as Blob
    })
    const file = makeFile('photo.jpg', 'image/jpeg')
    await expect(prepareImage(file)).resolves.toBe(file)
  })

  it('rounds fractional dimensions up to at least 1px', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1000, height: 3, close }),
    )
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(['webp'], { type: 'image/webp' }))
      return undefined as unknown as Blob
    })
    const file = makeFile('tall.png', 'image/png')
    const result = await prepareImage(file, { maxDimension: 512 })
    expect(result.type).toBe('image/webp')
    expect(drawImage.mock.calls[0][3]).toBeGreaterThanOrEqual(1)
  })
})

describe('validateAvatarFile', () => {
  function makeFile(name: string, type: string, size = 100): File {
    return new File([new Uint8Array(size)], name, { type })
  }

  it('accepts JPG, PNG, WebP, and GIF', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(validateAvatarFile(makeFile('a', type))).toBeNull()
    }
  })

  it('rejects unsupported types with the standard copy', () => {
    expect(validateAvatarFile(makeFile('a.bmp', 'image/bmp'))).toBe(
      'Please choose a JPG, PNG, WebP, or GIF image.',
    )
  })

  it('calls out HEIC explicitly', () => {
    expect(validateAvatarFile(makeFile('a.heic', 'image/heic'))).toBe(
      'Please choose a JPG, PNG, WebP, or GIF image (HEIC is not supported yet).',
    )
  })

  it('rejects files larger than 5 MB', () => {
    const big = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    expect(validateAvatarFile(big)).toBe('That image is larger than 5 MB.')
  })
})

describe('prepareAvatarVariants', () => {
  function makeFile(name: string, type: string, size = 100): File {
    return new File([new Uint8Array(size)], name, { type })
  }

  it('returns GIFs untouched for both variants', async () => {
    const file = makeFile('cat.gif', 'image/gif')
    await expect(prepareAvatarVariants(file)).resolves.toEqual({ full: file, thumb: file })
  })

  it('returns small images untouched for both variants', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 200, height: 100, close: vi.fn() }),
    )
    const file = makeFile('photo.jpg', 'image/jpeg')
    await expect(prepareAvatarVariants(file)).resolves.toEqual({ full: file, thumb: file })
  })

  it('keeps the original as full and emits only a 256px thumb for mid-size photos', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 800, height: 600, close }),
    )
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(['webp'], { type: 'image/webp' }))
      return undefined as unknown as Blob
    })

    const file = makeFile('photo.jpg', 'image/jpeg')
    const { full, thumb } = await prepareAvatarVariants(file)

    expect(full).toBe(file)
    expect(thumb.type).toBe('image/webp')
    expect(thumb.name).toContain('_thumb.webp')
    expect(drawImage).toHaveBeenCalledTimes(1)
    expect([drawImage.mock.calls[0][3], drawImage.mock.calls[0][4]]).toEqual([256, 192])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('builds a 1024px full and a 256px thumb from a large photo', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 2048, height: 1024, close }),
    )
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(['webp'], { type: 'image/webp' }))
      return undefined as unknown as Blob
    })

    const file = makeFile('photo.jpg', 'image/jpeg')
    const { full, thumb } = await prepareAvatarVariants(file)

    expect(full.type).toBe('image/webp')
    expect(thumb.type).toBe('image/webp')
    expect(full.name).toContain('_full.webp')
    expect(thumb.name).toContain('_thumb.webp')
    expect(AVATAR_FULL_MAX_DIMENSION).toBe(1024)
    expect(AVATAR_THUMB_MAX_DIMENSION).toBe(256)
    // First draw is the full canvas (1024x512), second is the thumb (256x128).
    expect(drawImage).toHaveBeenCalledTimes(2)
    expect([drawImage.mock.calls[0][3], drawImage.mock.calls[0][4]]).toEqual([1024, 512])
    expect([drawImage.mock.calls[1][3], drawImage.mock.calls[1][4]]).toEqual([256, 128])
    expect(close).toHaveBeenCalledTimes(1)
  })
})
