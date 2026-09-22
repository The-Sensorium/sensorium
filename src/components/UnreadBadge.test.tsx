import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnreadBadge } from './UnreadBadge'

describe('UnreadBadge', () => {
  it('renders nothing when there are no unread items', () => {
    const { container } = render(<UnreadBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the exact count from 1 to 9', () => {
    render(<UnreadBadge count={5} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('caps long counts at 9+ while keeping the full count in the label', () => {
    render(<UnreadBadge count={42} />)
    expect(screen.getByText('9+')).toBeInTheDocument()
    expect(screen.getByLabelText('42 unread notifications')).toBeInTheDocument()
  })
})
