import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CaseTimeline } from './CaseTimeline'

const hooks = vi.hoisted(() => ({
  useAddCaseNote: vi.fn(),
  useEditCaseNote: vi.fn(),
  useDeleteCaseNote: vi.fn(),
}))

vi.mock('../../../features/admin-moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../features/admin-moderation')>()
  return {
    ...actual,
    formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
    useAddCaseNote: hooks.useAddCaseNote,
    useEditCaseNote: hooks.useEditCaseNote,
    useDeleteCaseNote: hooks.useDeleteCaseNote,
  }
})
vi.mock('../../../features/notifications', () => ({
  timeAgo: () => 'just now',
}))

const actionEntry = {
  entry_id: 'a-1',
  kind: 'action',
  created_at: '2026-08-01T00:00:00Z',
  actor_id: 'mod-1',
  actor_display_name: 'Mara',
  action: 'report_claimed',
  body: 'Report claimed',
  metadata: {},
}

const noteEntry = {
  entry_id: 'n-1',
  kind: 'note',
  created_at: '2026-08-01T01:00:00Z',
  actor_id: 'me',
  actor_display_name: 'Me',
  action: 'note',
  body: 'Handoff: waiting on cluster context.',
  metadata: {},
}

function renderTimeline(entries: unknown[] = [actionEntry, noteEntry], canNote = true) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CaseTimeline
          reportId="r-1"
          entries={entries as never[]}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          myUserId="me"
          isAdmin={false}
          canNote={canNote}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CaseTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAddCaseNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    hooks.useEditCaseNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    hooks.useDeleteCaseNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  })

  it('renders actions and notes oldest-first', () => {
    renderTimeline()
    expect(screen.getByText('Handoff: waiting on cluster context.')).toBeInTheDocument()
    expect(screen.getByText('report claimed')).toBeInTheDocument()
  })

  it('shows the empty state when there is no activity', () => {
    renderTimeline([])
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument()
  })

  it('submits a note through the composer', async () => {
    const mutateAsync = vi.fn().mockResolvedValue('n-2')
    hooks.useAddCaseNote.mockReturnValue({ mutateAsync, isPending: false })
    renderTimeline()
    fireEvent.change(screen.getByLabelText('Add an internal note'), { target: { value: 'New context' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    expect(mutateAsync).toHaveBeenCalledWith({ p_report_id: 'r-1', p_note: 'New context' })
  })

  it('hides the composer when notes are not allowed', () => {
    renderTimeline([], false)
    expect(screen.queryByLabelText('Add an internal note')).not.toBeInTheDocument()
  })

  it('offers edit and delete on own notes', () => {
    renderTimeline()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
