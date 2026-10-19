import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Message } from '../../../features/cluster'

// Count renders of a child so a parent re-render with identical props proves
// the memo bailout rather than merely matching output.
const mentionRenders = vi.hoisted(() => ({ count: 0 }))

vi.mock('./MentionText', () => ({
  MentionText: ({ content }: { content: string }) => {
    mentionRenders.count += 1
    return <span>{content}</span>
  },
}))

vi.mock('../../../features/avatars', () => ({
  useAvatarUrl: () => ({ data: undefined }),
  useAvatarThumbUrl: () => ({ data: undefined }),
  useAvatarFullUrl: () => ({ data: undefined }),
  avatarThumbFor: (s: string | null | undefined) => s ?? null,
  avatarFullFor: (s: string | null | undefined) => s ?? null,
}))

import { MessageItem } from './MessageItem'

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
    audio_duration_sec: null,
    audio_mime: null,
    audio_url: null,
    audio_waveform: null,
    ...overrides,
  }
}

function stableProps(message: Message = makeMessage()) {
  return {
    message,
    mine: false,
    author: { id: 'a1', display_name: 'Alice Blue', avatar_url: null },
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
    replyParent: undefined,
    onEditDraftChange: () => {},
    onSaveEdit: () => {},
    onCancelEdit: () => {},
    onToggleMenu: () => {},
    onTogglePicker: () => {},
    onShowInfo: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onReply: () => {},
    onToggleReaction: () => {},
    onReport: () => {},
  }
}

const props = stableProps()

function ui() {
  return (
    <MemoryRouter>
      <MessageItem {...props} />
    </MemoryRouter>
  )
}

describe('MessageItem memoization', () => {
  it('does not re-render when its props are unchanged', () => {
    const view = render(ui())
    expect(mentionRenders.count).toBe(1)
    view.rerender(ui())
    expect(mentionRenders.count).toBe(1)
  })
})
