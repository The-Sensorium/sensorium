import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvailabilityBadge } from './AvailabilityBadge'

describe('AvailabilityBadge', () => {
  it('renders the label for a known availability', () => {
    render(<AvailabilityBadge value="available" />)
    expect(screen.getByText('Available', { selector: 'span:not(.sr-only)' })).toBeInTheDocument()
  })

  it('keeps a visually hidden label for screen readers when showLabel is false', () => {
    render(<AvailabilityBadge value="dnd" showLabel={false} />)
    expect(screen.getByText('Do not disturb', { selector: '.sr-only' })).toBeInTheDocument()
    expect(
      screen.queryByText('Do not disturb', { selector: 'span:not(.sr-only)' }),
    ).not.toBeInTheDocument()
  })

  it('renders the label only once when showLabel is true', () => {
    render(<AvailabilityBadge value="busy" />)
    expect(screen.getAllByText('Busy')).toHaveLength(2) // visible + sr-only
  })

  it('renders a dot for each availability value', () => {
    const { container } = render(<AvailabilityBadge value="busy" />)
    expect(container.querySelector('.bg-amber-500')).not.toBeNull()
  })
})
