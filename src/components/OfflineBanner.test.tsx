import { describe, expect, it } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    setOnline(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
    setOnline(true)
  })

  it('shows the banner when offline and hides on reconnect', () => {
    setOnline(false)
    render(<OfflineBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline")
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
