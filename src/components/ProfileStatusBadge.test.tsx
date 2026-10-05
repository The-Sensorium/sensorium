import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProfileStatusBadge } from './ProfileStatusBadge'

describe('ProfileStatusBadge', () => {
  it('renders the label for a known status', () => {
    render(<ProfileStatusBadge value="busy" />)
    expect(screen.getByText('Busy', { selector: 'span:not(.sr-only)' })).toBeInTheDocument()
  })

  it('renders the offline treatment', () => {
    render(<ProfileStatusBadge value="offline" />)
    expect(screen.getByText('Offline', { selector: 'span:not(.sr-only)' })).toBeInTheDocument()
  })

  it('hides the visible label when showLabel is false', () => {
    const { container } = render(<ProfileStatusBadge value="away" showLabel={false} />)
    expect(container.querySelector('span.sr-only')).toHaveTextContent('Away')
  })

  it('renders a dot for each status value', () => {
    for (const value of ['online', 'away', 'busy', 'invisible'] as const) {
      const { container, unmount } = render(<ProfileStatusBadge value={value} />)
      expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
      unmount()
    }
  })
})
