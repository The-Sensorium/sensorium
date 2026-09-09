import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from './PasswordInput'

function Harness() {
  const [value, setValue] = useState('secret123')
  return <PasswordInput label="Password" value={value} onChange={setValue} required minLength={8} />
}

describe('PasswordInput', () => {
  it('renders a password field with a show toggle', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('toggles visibility and swaps the icon label', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const toggle = screen.getByRole('button', { name: 'Show password' })
    await user.click(toggle)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('keeps the field value when toggling', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveValue('secret123')
  })
})
