import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RaiseSignalModal } from './RaiseSignalModal'

function setup(overrides: Partial<Parameters<typeof RaiseSignalModal>[0]> = {}) {
  const props = {
    open: true,
    error: null,
    prompt: '',
    pending: false,
    onPromptChange: vi.fn(),
    onClose: vi.fn(),
    onRaise: vi.fn(),
    ...overrides,
  }
  render(<RaiseSignalModal {...props} />)
  return { props }
}

describe('RaiseSignalModal', () => {
  it('renders the dialog with the prompt input', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Raise a signal' })).toBeInTheDocument()
    expect(screen.getByLabelText('What do you need help with?')).toBeInTheDocument()
  })

  it('disables the submit button while the prompt is empty', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Raise signal' })).toBeDisabled()
  })

  it('reports the character count', () => {
    setup({ prompt: 'help' })
    expect(screen.getByText('4/300')).toBeInTheDocument()
  })

  it('calls onPromptChange as the user types', async () => {
    const { props } = setup()
    await userEvent.type(screen.getByLabelText('What do you need help with?'), 'help')
    expect(props.onPromptChange).toHaveBeenCalledWith('h')
  })

  it('submits via onRaise and cancels via onClose', async () => {
    const { props } = setup({ prompt: 'help' })
    await userEvent.click(screen.getByRole('button', { name: 'Raise signal' }))
    expect(props.onRaise).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})