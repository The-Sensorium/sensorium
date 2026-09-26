import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkifiedText } from './LinkifiedText'

describe('LinkifiedText', () => {
  it('renders plain text without links', () => {
    render(<LinkifiedText text="hello world" />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders an external link with safe attributes', () => {
    render(<LinkifiedText text="see https://example.com/a now" />)
    const link = screen.getByRole('link', { name: 'https://example.com/a' })
    expect(link).toHaveAttribute('href', 'https://example.com/a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('prefixes www links with https', () => {
    render(<LinkifiedText text="go to www.example.com" />)
    expect(screen.getByRole('link', { name: 'www.example.com' })).toHaveAttribute(
      'href',
      'https://www.example.com',
    )
  })
})
