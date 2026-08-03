import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoodPicker } from './MoodPicker'

describe('MoodPicker', () => {
  it('renders every mood with an accessible label', () => {
    render(<MoodPicker value="good" onChange={() => {}} />)
    for (const label of ['Great', 'Good', 'Okay', 'Low', 'Stressed']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the active mood as pressed', () => {
    render(<MoodPicker value="stressed" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Stressed' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Good' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the selected mood', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Okay' }))
    expect(onChange).toHaveBeenCalledWith('okay')
  })

  it('does not respond when disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} disabled />)
    await user.click(screen.getByRole('button', { name: 'Low' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})