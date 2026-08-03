import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Settings">
        <p>content</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the title and children when open', () => {
    render(
      <Modal open onClose={() => {}} title="Settings">
        <p>content</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('closes via the close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Settings">
        <p>content</p>
      </Modal>,
    )
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Settings">
        <p>content</p>
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when clicking the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <Modal open onClose={onClose} title="Settings">
        <p>content</p>
      </Modal>,
    )
    await user.click(container.querySelector('div[role="presentation"]') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when clicking inside the panel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Settings">
        <button type="button">inner</button>
      </Modal>,
    )
    await user.click(screen.getByRole('button', { name: 'inner' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('traps Tab focus within the dialog', () => {
    // jsdom has no layout, so offsetParent is always null; stub it so the
    // focus-trap visibility filter keeps the buttons.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get: () => ({}),
    })
    render(
      <Modal open onClose={() => {}} title="Settings">
        <button type="button">first</button>
        <button type="button">second</button>
      </Modal>,
    )
    const close = screen.getByRole('button', { name: 'Close dialog' })
    const second = screen.getByRole('button', { name: 'second' })

    const dispatchTab = (target: HTMLElement, init: KeyboardEventInit = {}) => {
      const evt = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
        ...init,
      })
      target.dispatchEvent(evt)
      return evt
    }

    // Tab on the last focusable is intercepted (wraps to first).
    second.focus()
    expect(dispatchTab(second).defaultPrevented).toBe(true)

    // Shift+Tab on the first focusable is intercepted (wraps to last).
    close.focus()
    expect(dispatchTab(close, { shiftKey: true }).defaultPrevented).toBe(true)

    // A forward Tab from a non-boundary element is not intercepted.
    close.focus()
    expect(dispatchTab(close).defaultPrevented).toBe(false)
  })

  it('locks body scroll while open and restores it on close', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Settings">
        <p>content</p>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<Modal open={false} onClose={() => {}} title="Settings" />)
    expect(document.body.style.overflow).toBe('')
  })
})
