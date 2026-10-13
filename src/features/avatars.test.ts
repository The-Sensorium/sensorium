import { describe, expect, it, vi, beforeEach } from 'vitest'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult } from '../test/supabase-client'
import {
  avatarFullFor,
  avatarStoragePath,
  avatarThumbFor,
  deleteAvatarObject,
  deleteAvatarObjects,
  uploadAvatarPair,
} from './avatars'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))

const requireSupabaseMock = vi.mocked(requireSupabase)

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

  it('accepts variant file names with _full and _thumb suffixes', () => {
    expect(avatarStoragePath('u1/abc_full.webp')).toBe('u1/abc_full.webp')
    expect(avatarStoragePath('u1/abc_thumb.webp')).toBe('u1/abc_thumb.webp')
  })
})

describe('avatarThumbFor / avatarFullFor', () => {
  it('derives the thumb path from a full path', () => {
    expect(avatarThumbFor('u1/abc_full.webp')).toBe('u1/abc_thumb.webp')
  })

  it('derives the full path from a thumb path', () => {
    expect(avatarFullFor('u1/abc_thumb.webp')).toBe('u1/abc_full.webp')
  })

  it('returns the path itself when already the requested variant', () => {
    expect(avatarThumbFor('u1/abc_thumb.webp')).toBe('u1/abc_thumb.webp')
    expect(avatarFullFor('u1/abc_full.webp')).toBe('u1/abc_full.webp')
  })

  it('returns null for legacy single-file paths and empty values', () => {
    expect(avatarThumbFor('u1/photo.webp')).toBeNull()
    expect(avatarFullFor('u1/photo.webp')).toBeNull()
    expect(avatarThumbFor(null)).toBeNull()
    expect(avatarFullFor(undefined)).toBeNull()
  })
})

describe('deleteAvatarObject', () => {
  beforeEach(() => {
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(
      makeSupabaseClient(initialMockResult()) as never,
    )
  })

  it('removes the avatar object given a bare path', async () => {
    await deleteAvatarObject('u1/a.png')
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.storage.from).toHaveBeenCalledWith('avatars')
    expect(c.storage.from('avatars').remove).toHaveBeenCalledWith(['u1/a.png'])
  })

  it('extracts the storage path from a signed URL before removing', async () => {
    await deleteAvatarObject(
      'https://project.supabase.co/storage/v1/object/sign/avatars/u1%2Fb.webp?token=x',
    )
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.storage.from('avatars').remove).toHaveBeenCalledWith(['u1/b.webp'])
  })

  it('no-ops without a path', async () => {
    await deleteAvatarObject(null)
    await deleteAvatarObject(undefined)
    await deleteAvatarObject('')
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })
})

describe('deleteAvatarObjects', () => {
  beforeEach(() => {
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(
      makeSupabaseClient(initialMockResult()) as never,
    )
  })

  it('removes both the full and thumb objects', async () => {
    await deleteAvatarObjects('u1/a_full.webp', 'u1/a_thumb.webp')
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.storage.from).toHaveBeenCalledWith('avatars')
    expect(c.storage.from('avatars').remove).toHaveBeenCalledWith(['u1/a_full.webp', 'u1/a_thumb.webp'])
  })

  it('dedupes GIF rows that share one path and tolerates nulls', async () => {
    await deleteAvatarObjects('u1/a.gif', 'u1/a.gif')
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.storage.from('avatars').remove).toHaveBeenCalledWith(['u1/a.gif'])
    requireSupabaseMock.mockClear()
    await deleteAvatarObjects(null, null)
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })
})

describe('uploadAvatarPair', () => {
  beforeEach(() => {
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(
      makeSupabaseClient(initialMockResult()) as never,
    )
  })

  it('uploads full and thumb under one id and returns both paths', async () => {
    const full = new File(['full'], 'photo_full.webp', { type: 'image/webp' })
    const thumb = new File(['thumb'], 'photo_thumb.webp', { type: 'image/webp' })
    const { fullPath, thumbPath } = await uploadAvatarPair('u1', full, thumb)
    expect(fullPath).toMatch(/^u1\/.+_full\.webp$/)
    expect(thumbPath).toMatch(/^u1\/.+_thumb\.webp$/)
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.storage.from('avatars').upload).toHaveBeenCalledTimes(2)
  })

  it('uploads once when both variants share one file', async () => {
    const gif = new File(['gif'], 'cat.gif', { type: 'image/gif' })
    const { fullPath, thumbPath } = await uploadAvatarPair('u1', gif, gif)
    expect(fullPath).toBe(thumbPath)
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.storage.from('avatars').upload).toHaveBeenCalledTimes(1)
  })
})
