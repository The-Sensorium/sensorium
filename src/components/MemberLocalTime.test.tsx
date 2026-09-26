import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberLocalTime } from './MemberLocalTime'

describe('MemberLocalTime', () => {
  it('renders the time for a valid zone', () => {
    render(<MemberLocalTime timeZone="Asia/Kolkata" />)
    expect(screen.getByText(/\d{1,2}:\d{2} (AM|PM)/)).toBeInTheDocument()
  })

  it('renders nothing when the zone is missing', () => {
    const { container } = render(<MemberLocalTime timeZone={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing for an invalid zone', () => {
    const { container } = render(<MemberLocalTime timeZone="Not/AZone" />)
    expect(container.innerHTML).toBe('')
  })
})
