import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CountdownTimer } from './CountdownTimer'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

describe('CountdownTimer', () => {
  it('shows an Expired label for a past deadline', () => {
    render(<CountdownTimer deadline={new Date(Date.now() - HOUR_MS).toISOString()} />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('shows days/hours/minutes for a multi-day deadline', () => {
    render(<CountdownTimer deadline={new Date(Date.now() + 2 * DAY_MS + HOUR_MS).toISOString()} />)
    expect(screen.getByText(/2d \d+h \d+m/)).toBeInTheDocument()
  })

  it('drops the days when the deadline is under a day away', () => {
    render(<CountdownTimer deadline={new Date(Date.now() + 2 * HOUR_MS + MINUTE_MS).toISOString()} />)
    expect(screen.getByText(/[12]h \d+m/)).toBeInTheDocument()
  })

  it('shows a minute-only countdown for a near deadline', () => {
    render(<CountdownTimer deadline={new Date(Date.now() + 10 * MINUTE_MS).toISOString()} />)
    expect(screen.getByText(/^\d+m$/)).toBeInTheDocument()
  })
})