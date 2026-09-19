import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NotificationsPage } from './NotificationsPage'
import type { MyNotification } from '../features/notifications'

const hooks = vi.hoisted(() => ({
  list: { data: [] as MyNotification[], isLoading: false, isError: false },
  markRead: { mutate: vi.fn() },
  markAll: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
}))

const navigate = vi.hoisted(() => vi.fn())

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('../lib/use-document-title', () => ({ useDocumentTitle: vi.fn() }))
vi.mock('../features/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/notifications')>()
  return {
    ...actual,
    useMyNotifications: () => hooks.list,
    useMarkNotificationRead: () => hooks.markRead,
    useMarkAllNotificationsRead: () => hooks.markAll,
  }
})

function row(overrides: Partial<MyNotification> & { id: string }): MyNotification {
  return {
    type: 'mention',
    cluster_id: 'c1',
    title: `title ${overrides.id}`,
    body: null,
    payload: {},
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  } as MyNotification
}

beforeEach(() => {
  hooks.list.data = []
  hooks.list.isLoading = false
  hooks.list.isError = false
  hooks.markRead.mutate.mockClear()
  hooks.markAll.mutateAsync.mockClear()
  hooks.markAll.isPending = false
  navigate.mockClear()
})

describe('NotificationsPage seen-vs-clear', () => {
  it('clicking an unread row marks it read and navigates', () => {
    hooks.list.data = [row({ id: 'n1' })]
    render(<NotificationsPage />)

    fireEvent.click(screen.getByRole('button', { name: /title n1/ }))
    expect(hooks.markRead.mutate).toHaveBeenCalledWith('n1')
    expect(navigate).toHaveBeenCalledWith('/cluster/c1')
  })

  it('clicking a read row navigates without marking', () => {
    hooks.list.data = [row({ id: 'n2', read_at: '2026-01-01T00:00:00Z' })]
    render(<NotificationsPage />)

    expect(screen.queryByLabelText('Unread')).toBeNull()
    expect(screen.getByText(/all caught up/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /title n2/ }))
    expect(hooks.markRead.mutate).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/cluster/c1')
  })

  it('keeps read history visible with a caught-up subtitle', () => {
    hooks.list.data = [
      row({ id: 'n1' }),
      row({ id: 'n2', read_at: '2026-01-01T00:00:00Z' }),
    ]
    render(<NotificationsPage />)

    expect(screen.getByText('1 unread')).toBeVisible()
    expect(screen.getByRole('button', { name: /title n1/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /title n2/ })).toBeVisible()
  })

  it('enables Mark all read whenever rows exist, even with zero unread', () => {
    hooks.list.data = [row({ id: 'n2', read_at: '2026-01-01T00:00:00Z' })]
    render(<NotificationsPage />)

    const button = screen.getByRole('button', { name: 'Mark all read' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(hooks.markAll.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('disables Mark all read only when the list is empty', () => {
    hooks.list.data = []
    render(<NotificationsPage />)

    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
    expect(screen.getByText(/no notifications yet/i)).toBeVisible()
  })
})
