import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberLocalTime } from './MemberLocalTime'

afterEach(() => {
  vi.useRealTimers()
})

describe('MemberLocalTime', () => {
  it('renders the time for a valid zone', () => {
    render(<MemberLocalTime timeZone="Asia/Kolkata" />)
    expect(screen.getByText(/\d{1,2}:\d{2} (AM|PM)/)).toBeInTheDocument()
  })

  it('shows a sun icon for member daytime and moon at night', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    const day = render(<MemberLocalTime timeZone="UTC" />)
    expect(day.container.querySelector('svg.lucide-sun')).not.toBe(null)
    expect(day.container.querySelector('svg.text-amber-500')).not.toBe(null)
    day.unmount()

    vi.setSystemTime(new Date('2026-06-01T23:00:00Z'))
    const night = render(<MemberLocalTime timeZone="UTC" />)
    expect(night.container.querySelector('svg.lucide-moon')).not.toBe(null)
    expect(night.container.querySelector('svg.text-amber-500')).not.toBe(null)
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
