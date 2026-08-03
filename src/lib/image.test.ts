import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareImage } from './image'

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
