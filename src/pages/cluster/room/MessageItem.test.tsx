import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MessageItem } from './MessageItem'
import type { Message, Reaction } from '../../../features/cluster'

vi.mock('../../../features/avatars', () => ({
  useAvatarUrl: () => ({ data: undefined }),
}))

const author = { display_name: 'Alice Blue', avatar_url: null }

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    cluster_id: 'c1',
    author_id: 'a1',
    content: 'Hello world',
    created_at: '2026-01-01T12:00:00Z',
    deleted_at: null,
    edited_at: null,
    image_url: null,
    moderation_status: 'approved',
    reply_to_id: null,
    ...overrides,
  }
}

function setup(overrides: Partial<Parameters<typeof MessageItem>[0]> = {}) {
  const base = {
    message: makeMessage(),
    mine: false,
    author,
    reactions: [],
    myReactionKeys: new Set<string>(),
    members: [],
    clusterId: 'c1',
    showDay: false,
    isEditing: false,
    editDraft: '',
    editPending: false,
    menuOpen: false,
    pickerOpen: false,
    onEditDraftChange: vi.fn(),
    onSaveEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onToggleMenu: vi.fn(),
    onTogglePicker: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleReaction: vi.fn(),
  }
  const props = { ...base, ...overrides }
  render(
    <MemoryRouter>
      <MessageItem {...props} />
    </MemoryRouter>,
  )
  return { props }
}

describe('MessageItem', () => {
  it('renders the author name and content', () => {
    setup()
    expect(screen.getByText('Alice Blue')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('labels the current user message as You', () => {
    setup({ mine: true })
    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('groups reactions and shows a count', () => {
    const reactions: Reaction[] = [
      { message_id: 'm1', user_id: 'u1', emoji: '👍', created_at: '' },
      { message_id: 'm1', user_id: 'u2', emoji: '👍', created_at: '' },
    ]
    setup({ reactions })
    expect(screen.getByRole('button', { name: 'React 👍' })).toHaveTextContent('2')
  })

  it('marks reactions the user already made as pressed', () => {
    const reactions: Reaction[] = [
      { message_id: 'm1', user_id: 'me', emoji: '❤️', created_at: '' },
    ]
    setup({ reactions, myReactionKeys: new Set(['m1:❤️']) })
    expect(screen.getByRole('button', { name: 'React ❤️' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the action menu only for my messages', () => {
    setup({ mine: true, menuOpen: true })
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('wires edit and delete actions', async () => {
    const { props } = setup({ mine: true, menuOpen: true })
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(props.onEdit).toHaveBeenCalledWith(props.message)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(props.onDelete).toHaveBeenCalledWith('m1')
  })

  it('shows the inline edit textarea when editing', async () => {
    const { props } = setup({ isEditing: true, editDraft: 'edited text' })
    const textarea = screen.getByLabelText('Edit message')
    expect(textarea).toHaveValue('edited text')
    await userEvent.click(screen.getByRole('button', { name: 'Save edit' }))
    expect(props.onSaveEdit).toHaveBeenCalled()
  })

  it('renders the edited marker', () => {
    setup({ message: makeMessage({ edited_at: '2026-01-01T13:00:00Z' }) })
    expect(screen.getByLabelText('edited')).toHaveTextContent('(edited)')
  })
})