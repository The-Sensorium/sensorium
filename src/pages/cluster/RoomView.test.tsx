import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { RoomView } from './RoomView'
import type { Message } from '../../features/cluster'
import type { Signal } from '../../features/signals'
import type { Vote } from '../../features/votes'

// jsdom has no layout engine, so scrolling primitives are stubs.
Element.prototype.scrollIntoView = vi.fn()
window.scrollTo = vi.fn()

const hooks = vi.hoisted(() => ({
  CHAT_PAGE_SIZE: 3,
  messages: { data: [] as Message[], isLoading: false },
  reactions: { data: [] as Array<{ id: string; message_id: string; user_id: string; emoji: string }> },
  replyTargets: { data: [] as Array<[string, Message]> },
  loadEarlier: {
    mutateAsync: vi.fn().mockResolvedValue({ added: 0, hasMore: false }),
    isPending: false,
  },
  send: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
  toggleReaction: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
  editMessage: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
  deleteMessage: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
  uploadChatImage: vi.fn(),
  signals: { data: [] as Signal[], isLoading: false },
  signalReplies: {
    data: [] as Array<{ id: string; signal_id: string; author_id: string; content: string; created_at: string }>,
  },
  raise: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
  votes: { data: [] as Vote[], isLoading: false },
  markRead: { mutate: vi.fn() },
  members: {
    data: [
      { id: 'u1', display_name: 'Ally', avatar_url: null },
      { id: 'u2', display_name: 'Bo', avatar_url: null },
      { id: 'u3', display_name: 'Cy', avatar_url: null },
    ],
    isLoading: false,
  },
  presence: {
    online: new Set<string>(),
    typing: new Set<string>(),
    signalTyping: vi.fn(),
    resetTyping: vi.fn(),
  },
}))

vi.mock('../../app/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/auth-context')>()
  return {
    ...actual,
    useAuth: () => ({ state: 'signedIn', userId: 'u1', email: 'a@b.test' }),
  }
})
vi.mock('../../lib/supabase', () => ({ requireSupabase: vi.fn() }))
vi.mock('../../features/cluster', () => ({
  CHAT_PAGE_SIZE: hooks.CHAT_PAGE_SIZE,
  useClusterMessages: () => hooks.messages,
  useClusterReactions: () => hooks.reactions,
  useLoadEarlierMessages: () => hooks.loadEarlier,
  useReplyTargets: () => hooks.replyTargets,
  useSendMessage: () => hooks.send,
  useToggleReaction: () => hooks.toggleReaction,
  useEditMessage: () => hooks.editMessage,
  useDeleteMessage: () => hooks.deleteMessage,
  useChatImageUrl: () => ({ data: undefined }),
  uploadChatImage: hooks.uploadChatImage,
}))
vi.mock('../../features/signals', () => ({
  useClusterSignals: () => hooks.signals,
  useSignalReplies: () => hooks.signalReplies,
  useRaiseSignal: () => hooks.raise,
}))
vi.mock('../../features/votes', () => ({ useClusterVotes: () => hooks.votes }))
vi.mock('../../features/matching', () => ({ useClusterMembers: () => hooks.members }))
vi.mock('../../features/notifications', () => ({ useMarkClusterRead: () => hooks.markRead }))
vi.mock('../../features/realtime', () => ({ usePresence: () => hooks.presence }))
vi.mock('../../features/avatars', () => ({ useAvatarUrl: () => ({ data: undefined }) }))
vi.mock('../../features/gifs', () => ({
  gifSearchEnabled: false,
  useSearchGifs: () => ({ data: [], isPending: false }),
  useTrendingGifs: () => ({ data: [], isPending: false }),
}))

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

function msg(over: Partial<Message>): Message {
  return {
    id: 'm1',
    cluster_id: 'c1',
    author_id: 'u2',
    content: 'hello',
    image_url: null,
    reply_to_id: null,
    deleted_at: null,
    edited_at: null,
    moderation_status: 'pending',
    created_at: '2026-01-01T10:00:00Z',
    ...over,
  } as Message
}

function signal(over: Partial<Signal>): Signal {
  return {
    id: 's1',
    cluster_id: 'c1',
    author_id: 'u2',
    prompt: 'I need a hand',
    status: 'open',
    created_at: '2026-01-01T11:00:00Z',
    resolved_at: null,
    resolved_by: null,
    ...over,
  } as Signal
}

function vote(over: Partial<Vote>): Vote {
  return {
    id: 'v1',
    type: 'replace_member',
    status: 'open',
    created_at: '2026-01-01T09:00:00Z',
    closes_at: '2026-01-02T09:00:00Z',
    initiated_by: 'u1',
    target_member_id: 'u2',
    name_suggestion: null,
    result: null,
    ...over,
  } as Vote
}

let queryClient: QueryClient

function resetHooks() {
  hooks.messages = { data: [], isLoading: false }
  hooks.reactions = { data: [] }
  hooks.replyTargets = { data: [] }
  hooks.loadEarlier = {
    mutateAsync: vi.fn().mockResolvedValue({ added: 0, hasMore: false }),
    isPending: false,
  }
  hooks.send = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
  hooks.toggleReaction = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
  hooks.editMessage = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
  hooks.deleteMessage = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
  hooks.signals = { data: [], isLoading: false }
  hooks.signalReplies = { data: [] }
  hooks.raise = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
  hooks.votes = { data: [], isLoading: false }
  hooks.markRead = { mutate: vi.fn() }
  hooks.members = {
    data: [
      { id: 'u1', display_name: 'Ally', avatar_url: null },
      { id: 'u2', display_name: 'Bo', avatar_url: null },
      { id: 'u3', display_name: 'Cy', avatar_url: null },
    ],
    isLoading: false,
  }
  hooks.presence = {
    online: new Set<string>(),
    typing: new Set<string>(),
    signalTyping: vi.fn(),
    resetTyping: vi.fn(),
  }
}

function makeUi() {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/cluster/c1']}>
        <Routes>
          <Route path="/cluster/:clusterId" element={<RoomView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderRoom() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(makeUi())
}

function timeline() {
  return screen.getByRole('list', { name: 'Room timeline' })
}

beforeEach(() => {
  resetHooks()
})

describe('RoomView timeline', () => {
  it('renders messages, signals and votes in created_at order', () => {
    hooks.messages.data = [msg({ content: 'a message in the middle' })]
    hooks.signals.data = [signal({ created_at: '2026-01-01T11:00:00Z' })]
    hooks.votes.data = [vote({ created_at: '2026-01-01T09:00:00Z' })]

    renderRoom()

    const text = timeline().textContent ?? ''
    expect(text.indexOf('Replace Bo')).toBeLessThan(text.indexOf('a message in the middle'))
    expect(text.indexOf('a message in the middle')).toBeLessThan(text.indexOf('I need a hand'))
  })

  it('hides deleted messages, resolved signals and closed votes', () => {
    hooks.messages.data = [
      msg({ content: 'visible' }),
      msg({ id: 'm2', content: 'deleted message', deleted_at: '2026-01-01T12:00:00Z' }),
    ]
    hooks.signals.data = [signal({ id: 's2', prompt: 'resolved signal', status: 'resolved' })]
    hooks.votes.data = [vote({ id: 'v2', status: 'closed' })]

    renderRoom()

    expect(screen.getByText('visible')).toBeInTheDocument()
    expect(screen.queryByText('deleted message')).not.toBeInTheDocument()
    expect(screen.queryByText('resolved signal')).not.toBeInTheDocument()
    expect(screen.queryByText(/closed/i)).not.toBeInTheDocument()
  })

  it('renders a day divider between different days but not within the same day', () => {
    hooks.messages.data = [
      msg({ created_at: '2026-01-01T10:00:00Z' }),
      msg({ id: 'm2', created_at: '2026-01-01T11:00:00Z' }),
      msg({ id: 'm3', created_at: '2026-01-02T10:00:00Z' }),
    ]

    renderRoom()

    const dayOne = dayFormatter.format(new Date('2026-01-01T00:00:00Z'))
    const dayTwo = dayFormatter.format(new Date('2026-01-02T00:00:00Z'))
    expect(screen.getAllByText(dayOne)).toHaveLength(1)
    expect(screen.getAllByText(dayTwo)).toHaveLength(1)
  })

  it('shows the loading state', () => {
    hooks.messages = { data: [], isLoading: true }
    renderRoom()
    expect(screen.getByText('Loading the room…')).toBeInTheDocument()
  })

  it('shows the empty state', () => {
    renderRoom()
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument()
  })

  it('offers Load earlier for a full page and hides it once history is drained', async () => {
    hooks.messages.data = [
      msg({ id: 'm1', created_at: '2026-01-01T10:00:00Z' }),
      msg({ id: 'm2', created_at: '2026-01-01T11:00:00Z' }),
      msg({ id: 'm3', created_at: '2026-01-01T12:00:00Z' }),
    ]

    const { rerender } = renderRoom()
    const button = await screen.findByRole('button', { name: 'Load earlier messages' })

    await userEvent.click(button)
    await waitFor(() => expect(hooks.loadEarlier.mutateAsync).toHaveBeenCalled())

    rerender(makeUi())
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument()
  })

  it('shows a new-message badge when scrolled up and jumps to the end on click', async () => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(500)
    hooks.messages.data = [msg({ id: 'm1' })]

    const { rerender } = renderRoom()
    hooks.messages.data = [msg({ id: 'm1' }), msg({ id: 'm2' })]
    rerender(makeUi())

    const badge = await screen.findByRole('button', { name: 'Jump to 1 new message' })
    await userEvent.click(badge)
    expect(screen.queryByRole('button', { name: 'Jump to 1 new message' })).not.toBeInTheDocument()
  })

  it('labels typing members in the room', () => {
    hooks.presence.typing = new Set(['u2'])
    renderRoom()
    expect(screen.getByText('Bo is typing…')).toBeInTheDocument()
  })

  it('summarizes multiple typing members', () => {
    hooks.presence.typing = new Set(['u2', 'u3'])
    renderRoom()
    expect(screen.getByText('Several people are typing…')).toBeInTheDocument()
  })

  it('renders the presence strip with member links and counts', () => {
    renderRoom()
    expect(screen.getByText('1 of 3 here')).toBeInTheDocument()
    expect(screen.getByTitle('Bo')).toHaveAttribute('href', '/profile/u2?cluster=c1')
  })

  it('suppresses the reply quote when the parent is deleted', () => {
    hooks.messages.data = [
      msg({ id: 'parent', content: 'the original', deleted_at: '2026-01-01T09:00:00Z' }),
      msg({ id: 'child', content: 'a reply', reply_to_id: 'parent' }),
    ]
    renderRoom()
    expect(screen.getByText('a reply')).toBeInTheDocument()
    expect(screen.getByText('message')).toBeInTheDocument()
    expect(screen.queryByText('the original')).not.toBeInTheDocument()
  })

  it('quotes a live parent in the reply preview', () => {
    hooks.messages.data = [
      msg({ id: 'parent', content: 'the original' }),
      msg({ id: 'child', content: 'a reply', reply_to_id: 'parent' }),
    ]
    renderRoom()
    // Once as the parent bubble, once inside the reply quote.
    expect(screen.getAllByText('the original')).toHaveLength(2)
  })

  it('surfaces reaction failures', async () => {
    hooks.messages.data = [msg({ id: 'm1' })]
    hooks.toggleReaction = {
      mutateAsync: vi.fn().mockRejectedValue(new Error('reaction boom')),
      isPending: false,
    }
    renderRoom()

    await userEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add 👍' }))

    expect(await screen.findByText('reaction boom')).toBeInTheDocument()
  })

  it('sends a message through the composer', async () => {
    renderRoom()
    await userEvent.type(screen.getByRole('combobox', { name: 'Message' }), 'hi there')
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(hooks.send.mutateAsync).toHaveBeenCalledWith({
        clusterId: 'c1',
        content: 'hi there',
        replyToId: undefined,
      }),
    )
  })

  it('attaches the reply target when replying', async () => {
    hooks.messages.data = [msg({ id: 'm1', content: 'original' })]
    renderRoom()

    await userEvent.click(screen.getByRole('button', { name: 'Reply' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Message' }), 'a reply')
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(hooks.send.mutateAsync).toHaveBeenCalledWith({
        clusterId: 'c1',
        content: 'a reply',
        replyToId: 'm1',
      }),
    )
  })
})
