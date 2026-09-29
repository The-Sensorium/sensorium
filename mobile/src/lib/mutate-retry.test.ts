import { describe, expect, it, vi } from 'vitest'
import { mutateWithRetry } from './mutate-retry'

describe('mutateWithRetry', () => {
  it('returns the first success without retrying', async () => {
    const fn = vi.fn(async () => 'ok')
    await expect(mutateWithRetry(fn, { baseMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures then succeeds', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok')
    await expect(mutateWithRetry(fn, { retries: 3, baseMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws permanent errors immediately without retrying', async () => {
    const permanent = Object.assign(new Error('denied'), { code: '42501' })
    const fn = vi.fn(async (): Promise<string> => {
      throw permanent
    })
    await expect(mutateWithRetry(fn, { retries: 3, baseMs: 1 })).rejects.toBe(permanent)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after the retry budget', async () => {
    const fn = vi.fn(async (): Promise<string> => {
      throw new Error('offline')
    })
    await expect(mutateWithRetry(fn, { retries: 2, baseMs: 1 })).rejects.toThrow('offline')
    expect(fn).toHaveBeenCalledTimes(3)
  })
});
