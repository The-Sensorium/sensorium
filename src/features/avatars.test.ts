import { describe, expect, it, vi, beforeEach } from 'vitest'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult } from '../test/supabase-client'
import { avatarStoragePath, deleteAvatarObject } from './avatars'

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
