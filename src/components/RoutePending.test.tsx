import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoutePending } from './RoutePending'

describe('RoutePending', () => {
  it('announces loading once', () => {
    render(<RoutePending />)
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument()
  })
})
