import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CountryFlag } from './CountryFlag'

describe('CountryFlag', () => {
  it('renders an SVG flag for a known code', () => {
    const { container } = render(<CountryFlag code="US" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('is case-insensitive', () => {
    const { container } = render(<CountryFlag code="in" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders nothing for an unknown code', () => {
    const { container } = render(<CountryFlag code="ZZ" />)
    expect(container.innerHTML).toBe('')
  })

  it('is decorative by default and labelled when asked', () => {
    const plain = render(<CountryFlag code="GB" />)
    expect(plain.container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    const labelled = render(<CountryFlag code="GB" label="United Kingdom" />)
    expect(labelled.container.querySelector('svg')?.getAttribute('aria-label')).toBe('United Kingdom')
  })
})
