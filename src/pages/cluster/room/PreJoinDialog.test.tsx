import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreJoinDialog } from './PreJoinDialog'

function setup(overrides: Partial<Parameters<typeof PreJoinDialog>[0]> = {}) {
  const props = {
    open: true,
    mic: true,
    camera: false,
    pending: false,
    onMicChange: vi.fn(),
    onCameraChange: vi.fn(),
    onJoin: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<PreJoinDialog {...props} />)
  return { props }
}

describe('PreJoinDialog', () => {
  it('starts audio-first with the microphone on and the camera off', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Join the call' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn microphone off' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('toggles devices and joins or cancels', async () => {
    const { props } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Turn camera on' }))
    expect(props.onCameraChange).toHaveBeenCalledWith(true)
    await userEvent.click(screen.getByRole('button', { name: 'Turn microphone off' }))
    expect(props.onMicChange).toHaveBeenCalledWith(false)
    await userEvent.click(screen.getByRole('button', { name: 'Join call' }))
    expect(props.onJoin).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('disables joining while the call mutation is pending', () => {
    setup({ pending: true })
    expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Turn microphone off' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeDisabled()
  })

  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog', { name: 'Join the call' })).not.toBeInTheDocument()
  })
})
