import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Composer } from './Composer'
import type { MentionMember } from '../../../features/mentions'

vi.mock('../../../features/avatars', () => ({
  useAvatarUrl: () => ({ data: undefined }),
}))

vi.mock('../../../features/gifs', () => ({
  gifSearchEnabled: true,
  useSearchGifs: () => ({ data: [], isPending: false, error: null }),
  useTrendingGifs: () => ({ data: [], isPending: false, error: null }),
}))

const members: MentionMember[] = [
  { id: 'r1', display_name: 'Rio Mendez', avatar_url: null },
  { id: 'r2', display_name: 'Alice Blue', avatar_url: null },
]

function setup(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const base = {
    members,
    selfId: 'me',
    pending: false,
    raisePending: false,
    error: null,
    onError: vi.fn(),
    onTyping: vi.fn(),
    onStopTyping: vi.fn(),
    onSend: vi.fn().mockResolvedValue(undefined),
    onSendImage: vi.fn().mockResolvedValue(undefined),
    onOpenSignal: vi.fn(),
  }
  const props = { ...base, ...overrides }
  const utils = render(
    <Composer
      members={props.members}
      selfId={props.selfId}
      pending={props.pending}
      raisePending={props.raisePending}
      error={props.error}
      onError={props.onError}
      onTyping={props.onTyping}
      onStopTyping={props.onStopTyping}
      onSend={props.onSend}
      onSendImage={props.onSendImage}
      onOpenSignal={props.onOpenSignal}
    />,
  )
  return { ...utils, props }
}

const input = () => screen.getByRole('combobox', { name: 'Message' })

describe('Composer', () => {
  it('disables the send button while empty', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('submits trimmed content via onSend on Enter', async () => {
    const { props } = setup()
    await userEvent.type(input(), '  hello there   ')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith('hello there'))
    expect(props.onStopTyping).toHaveBeenCalled()
  })

  it('opens the mention listbox on @ and inserts the selected member', async () => {
    const { props } = setup()
    await userEvent.type(input(), 'hey @Rio')
    const option = screen.getByRole('option', { name: /Rio Mendez/ })
    expect(option).toBeInTheDocument()
    expect(option).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(input()).toHaveValue('hey @Rio Mendez '))
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('excludes the current user from the autocomplete', async () => {
    setup({ selfId: 'r1' })
    await userEvent.type(input(), 'hey @Rio')
    expect(screen.queryByRole('option', { name: /Rio Mendez/ })).not.toBeInTheDocument()
  })

  it('calls onOpenSignal from the room actions menu', async () => {
    const { props } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Room actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Raise a signal' }))
    expect(props.onOpenSignal).toHaveBeenCalledTimes(1)
  })

  it('does not submit the message when Enter is pressed in the GIF search box', async () => {
    const { props } = setup()
    await userEvent.type(input(), 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Room actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Send a GIF' }))
    const search = screen.getByRole('searchbox', { name: 'Search GIFs' })
    await userEvent.type(search, 'puppy{Enter}')
    expect(props.onSend).not.toHaveBeenCalled()
    expect(search).toHaveValue('puppy')
  })

  it('rejects an unsupported image with an error via onError', async () => {
    const { container, props } = setup()
    const file = new File(['x'], 'bad.txt', { type: 'text/plain' })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(fileInput).not.toBeNull()
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } })
    await waitFor(() =>
      expect(props.onError).toHaveBeenCalledWith('Only JPG, PNG, WebP and GIF images are supported.'),
    )
  })
})