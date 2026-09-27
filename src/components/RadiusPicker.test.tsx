import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RadiusPicker } from './RadiusPicker'

describe('RadiusPicker', () => {
  it('marks the selected bucket pressed', () => {
    const onChange = vi.fn()
    render(<RadiusPicker value={50} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /50 km/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /10 km/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('selects buckets and shows waiting counts', () => {
    const onChange = vi.fn()
    render(<RadiusPicker value={10} onChange={onChange} counts={{ 10: 2, 50: 6, 100: 1 }} />)
    expect(screen.getByRole('button', { name: /50 km/ }).textContent).toContain('6/8')
    fireEvent.click(screen.getByRole('button', { name: /100 km/ }))
    expect(onChange).toHaveBeenCalledWith(100)
  })

  it('renders with nothing pressed when no radius is chosen yet', () => {
    const onChange = vi.fn()
    render(<RadiusPicker value={null} onChange={onChange} />)
    for (const radius of [10, 50, 100]) {
      expect(
        screen.getByRole('button', { name: new RegExp(`${radius} km`) }),
      ).toHaveAttribute('aria-pressed', 'false')
    }
  })
})
