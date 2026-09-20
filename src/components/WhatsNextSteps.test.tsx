import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhatsNextSteps } from './WhatsNextSteps'

describe('WhatsNextSteps', () => {
  it('renders the three steps with 8 and jumping in', () => {
    render(<WhatsNextSteps />)
    expect(screen.getByRole('region', { name: 'What happens next' })).toHaveAttribute(
      'data-e2e',
      'whats-next-steps',
    )
    expect(screen.getByText(/notify you once 8 are in/)).toBeInTheDocument()
    expect(screen.getByText(/Jump straight into the conversation/)).toBeInTheDocument()
    expect(screen.getByText(/Answer the 5 intro questions/)).toBeInTheDocument()
  })

  it('renders compact text when compact', () => {
    const { container } = render(<WhatsNextSteps compact />)
    expect(container.querySelector('ol')).toHaveClass('text-xs')
  })
})
