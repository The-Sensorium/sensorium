import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhatsNextSteps } from './WhatsNextSteps'

describe('WhatsNextSteps', () => {
  it('renders the three steps with 8 and 72 hours', () => {
    render(<WhatsNextSteps />)
    expect(screen.getByRole('region', { name: 'What happens next' })).toHaveAttribute(
      'data-e2e',
      'whats-next-steps',
    )
    expect(screen.getByText(/notify you once 8 are in/)).toBeInTheDocument()
    expect(screen.getByText(/Once your cluster forms, you have 72 hours/)).toBeInTheDocument()
    expect(screen.getByText(/lose your spot/)).toBeInTheDocument()
    expect(screen.getByText(/Chat unlocks once everyone answers/)).toBeInTheDocument()
  })

  it('renders compact text when compact', () => {
    const { container } = render(<WhatsNextSteps compact />)
    expect(container.querySelector('ol')).toHaveClass('text-xs')
  })
})
