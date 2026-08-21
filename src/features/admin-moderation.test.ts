import { describe, expect, it } from 'vitest'
import { formatError } from './admin-moderation'

describe('formatError', () => {
  it('passes through Error messages', () => {
    expect(formatError(new Error('boom'))).toBe('boom')
  })

  it('extracts the message from a PostgrestError-like plain object', () => {
    const postgrestError = { message: 'last_admin_required', code: 'P0001', details: null, hint: null }
    expect(formatError(postgrestError)).toBe('Action blocked: you cannot remove the last active admin.')
  })

  it('falls back to String() for anything else instead of [object Object] placeholders', () => {
    expect(formatError(null)).toBe('null')
    expect(formatError('plain string')).toBe('plain string')
  })

  it('maps known database codes to friendly messages', () => {
    expect(formatError({ message: 'last_admin_required' })).toBe(
      'Action blocked: you cannot remove the last active admin.',
    )
    expect(formatError({ message: 'cannot_grant_self' })).toBe('Action blocked: you cannot assign a role to yourself.')
    expect(formatError({ message: 'cannot_revoke_self' })).toBe('Action blocked: you cannot revoke your own role.')
    expect(formatError({ message: 'already_assigned' })).toBe('That role is already assigned to this user.')
    expect(formatError({ message: 'user_not_found' })).toBe('No account found with that email address.')
    expect(formatError({ message: 'insufficient_permission' })).toBe(
      'Your account no longer has permission for this action.',
    )
    expect(formatError({ message: 'restriction_limit' })).toBe('Temporary suspensions are limited to 7 days.')
    expect(formatError({ message: 'account_inactive' })).toBe(
      'Your account is restricted and you can’t perform staff actions right now.',
    )
    expect(formatError({ message: 'cannot_unban' })).toBe('Only an admin can lift a permanent ban.')
    expect(formatError({ message: 'cannot_restrict_staff' })).toBe('Only an admin can suspend a staff member.')
    expect(formatError({ message: 'expiry_required' })).toBe('A temporary suspension needs an end date.')
    expect(formatError({ message: 'suspension_too_long' })).toBe('Temporary suspensions are limited to 7 days.')
  })
})
