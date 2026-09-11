import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StaffAccountsPage } from './StaffAccountsPage'

const hooks = vi.hoisted(() => ({
  useStaffAccountSearch: vi.fn(),
}))

vi.mock('../../features/admin-accounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/admin-accounts')>()
  return { ...actual, useStaffAccountSearch: hooks.useStaffAccountSearch, useStaffBase: () => '/admin' }
})

const row = {
  user_id: 'u-1',
  display_name: 'Nadia Petrov',
  email: 'nadia@example.com',
  account_status: 'active',
  roles: ['moderator'],
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <StaffAccountsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('StaffAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    hooks.useStaffAccountSearch.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })
  })

  it('debounces search and renders rows with status and roles', async () => {
    hooks.useStaffAccountSearch.mockReturnValue({ data: [row], isLoading: false, isError: false, refetch: vi.fn() })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Search by name/), { target: { value: 'nad' } })
    expect(hooks.useStaffAccountSearch).toHaveBeenCalledWith('')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(hooks.useStaffAccountSearch).toHaveBeenCalledWith('nad')
    expect(screen.getByText('Nadia Petrov')).toBeInTheDocument()
    expect(screen.getByText('moderator')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nadia Petrov/ })).toHaveAttribute('href', '/admin/accounts/u-1')
  })

  it('shows the empty state when nothing matches', () => {
    hooks.useStaffAccountSearch.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Search by name/), { target: { value: 'zzz' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText(/No accounts match/)).toBeInTheDocument()
  })

  it('shows an error state with retry', () => {
    hooks.useStaffAccountSearch.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Search by name/), { target: { value: 'nad' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText(/Couldn’t search accounts/)).toBeInTheDocument()
  })
})
