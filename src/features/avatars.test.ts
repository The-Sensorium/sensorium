import { describe, expect, it } from 'vitest'
import { avatarStoragePath } from './avatars'

describe('avatarStoragePath', () => {
  it('returns null for empty values', () => {
    expect(avatarStoragePath(null)).toBeNull()
    expect(avatarStoragePath(undefined)).toBeNull()
    expect(avatarStoragePath('')).toBeNull()
  })

  it('extracts a real path from a signed URL (query stripped, encoding decoded)', () => {
    const url =
      'https://project.supabase.co/storage/v1/object/sign/avatars/abc%2Fphoto.webp?token=x'
    expect(avatarStoragePath(url)).toBe('abc/photo.webp')
  })

  it('does not decode a bare path', () => {
    expect(avatarStoragePath('abc/photo.webp')).toBe('abc/photo.webp')
  })

  it('passes bare paths through unchanged', () => {
    expect(avatarStoragePath('def/photo.webp')).toBe('def/photo.webp')
  })

  it('extracts the path when the avatars marker appears mid-string', () => {
    expect(avatarStoragePath('prefix/avatars/inside.webp')).toBe('inside.webp')
  })
})
