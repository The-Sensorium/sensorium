import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MentionText } from './MentionText'
import type { MentionMember } from '../../../features/mentions'

const members: MentionMember[] = [
  { id: 'u1', display_name: 'Diya Mendez' },
  { id: 'u3', display_name: 'Casey' },
]

function setup(content: string, mine = false) {
  return render(
    <MemoryRouter>
      <MentionText content={content} members={members} clusterId="c1" mine={mine} />
    </MemoryRouter>,
  )
}

describe('MentionText', () => {
  it('renders a member mention as a profile link', () => {
    setup('Hey @Casey')
    const link = screen.getByRole('link', { name: '@Casey' })
    expect(link).toHaveAttribute('href', '/profile/u3?cluster=c1')
  })

  it('renders @everyone as a non-link chip', () => {
    const { container } = setup('Hi @everyone!')
    const chip = screen.getByText('@everyone')
    expect(chip.tagName).not.toBe('A')
    expect(chip).toHaveClass('text-primary')
    expect(container.querySelector('a')).toBeNull()
  })

  it('renders a broadcast alongside a member link', () => {
    setup('Hi @everyone and @Casey')
    expect(screen.getByText('@everyone').tagName).not.toBe('A')
    expect(screen.getByRole('link', { name: '@Casey' })).toBeInTheDocument()
  })

  it('renders pasted urls as external links alongside mentions', () => {
    setup('Hey @Casey see https://example.com/a')
    expect(screen.getByRole('link', { name: '@Casey' })).toHaveAttribute(
      'href',
      '/profile/u3?cluster=c1',
    )
    const external = screen.getByRole('link', { name: 'https://example.com/a' })
    expect(external).toHaveAttribute('href', 'https://example.com/a')
    expect(external).toHaveAttribute('target', '_blank')
  })

  it('renders outgoing mentions white, semibold and underlined with no pill', () => {
    const { container } = setup('Hi @everyone and @Casey', true)
    const everyone = screen.getByText('@everyone')
    expect(everyone.tagName).not.toBe('A')
    expect(everyone).toHaveClass('text-on-primary')
    expect(everyone).toHaveClass('font-semibold')
    expect(everyone).toHaveClass('underline')
    expect(everyone.className).not.toContain('bg-')
    const link = screen.getByRole('link', { name: '@Casey' })
    expect(link).toHaveAttribute('href', '/profile/u3?cluster=c1')
    expect(link).toHaveClass('text-on-primary')
    expect(link).toHaveClass('underline')
    expect(link.className).not.toContain('bg-')
    expect(container.querySelector('.bg-primary\\/10')).toBeNull()
  })
})
