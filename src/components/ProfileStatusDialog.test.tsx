import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ProfileStatusDialog } from './ProfileStatusDialog'

describe('ProfileStatusDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ProfileStatusDialog open={false} onClose={() => {}} current="online" onSelect={() => {}} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders all four options with descriptions', () => {
    render(
      <ProfileStatusDialog open onClose={() => {}} current="online" onSelect={() => {}} />,
    )
    const group = screen.getByRole('radiogroup', { name: 'Profile status' })
    const options = within(group).getAllByRole('radio')
    expect(options).toHaveLength(4)
    expect(screen.getByText('Online')).toBeInTheDocument()
    expect(screen.getByText('Away')).toBeInTheDocument()
    expect(screen.getByText('Busy')).toBeInTheDocument()
    expect(screen.getByText('Invisible')).toBeInTheDocument()
    expect(screen.getByText('Your status is visible to your cluster.')).toBeInTheDocument()
  })

  it('marks the current status as checked', () => {
    render(
      <ProfileStatusDialog open onClose={() => {}} current="away" onSelect={() => {}} />,
    )
    expect(screen.getByRole('radio', { name: /Away/ }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(screen.getByRole('radio', { name: /Online/ }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('selects a status when its option is clicked', () => {
    const onSelect = vi.fn()
    render(
      <ProfileStatusDialog open onClose={() => {}} current="online" onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByRole('radio', { name: /Busy/ }))
    expect(onSelect).toHaveBeenCalledWith('busy')
  })

  it('closes with Escape', () => {
    const onClose = vi.fn()
    render(
      <ProfileStatusDialog open onClose={onClose} current="online" onSelect={() => {}} />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
