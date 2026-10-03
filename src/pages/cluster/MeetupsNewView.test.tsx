import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { zonedTimeToISO } from '../../lib/timezones'
import { MeetupsNewView } from './MeetupsNewView'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useAvatarUrl: vi.fn(),
  useClusterMembers: vi.fn(),
  useCreateMeetup: vi.fn(),
}))
const navigate = vi.hoisted(() => vi.fn())

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useParams: () => ({ clusterId: 'c1' }), useNavigate: () => navigate }
})
vi.mock('../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl }))
vi.mock('../../features/matching', () => ({ useClusterMembers: hooks.useClusterMembers }))
vi.mock('../../features/meetups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/meetups')>()
  return { ...actual, useCreateMeetup: hooks.useCreateMeetup }
})

const members = [
  { id: 'u1', display_name: 'Ally', avatar_url: null, timezone: 'Europe/Lisbon' },
  { id: 'u2', display_name: 'Bo', avatar_url: null, timezone: 'America/New_York' },
  { id: 'u3', display_name: 'Cy', avatar_url: null, timezone: null },
]

function localDateInput(daysOut: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOut)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

beforeEach(() => {
  vi.clearAllMocks()
  hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' })
  hooks.useAvatarUrl.mockReturnValue({ data: null })
  hooks.useClusterMembers.mockReturnValue({ data: members, isPending: false })
  hooks.useCreateMeetup.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue('m1'), isPending: false })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <MeetupsNewView />
    </MemoryRouter>,
  )
}

// NOTE: the suite uses data-e2e (the Playwright test id); Testing Library
// reads data-testid, so rows are queried from the DOM directly.
function customRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-e2e="meetup-custom-row"]'))
}

function fillRow(container: HTMLElement, index: number, daysOut: number, time: string) {
  const row = customRows(container)[index]
  fireEvent.change(within(row as HTMLElement).getByLabelText(`Option ${index + 1} day`), {
    target: { value: localDateInput(daysOut) },
  })
  fireEvent.change(within(row as HTMLElement).getByLabelText(`Option ${index + 1} time`), {
    target: { value: time },
  })
}

function removeRow(index: number) {
  fireEvent.click(screen.getByRole('button', { name: `More options for option ${index + 1}` }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove option' }))
}

describe('MeetupsNewView', () => {
  it('prefills one valid row and requires a second before proposing', () => {
    const { container } = renderPage()
    expect(screen.getByText('Propose times')).toBeTruthy()
    // Prefilled first row (next Saturday 7pm) is already valid.
    expect(customRows(container)).toHaveLength(1)
    expect(screen.getByText('1 time added.')).toBeTruthy()
    expect(screen.getByText('Add one more to propose.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add at least one more time' })).toBeDisabled()
  })

  it('previews per-member local times and proposes the ballot', async () => {
    const create = vi.fn().mockResolvedValue('m1')
    hooks.useCreateMeetup.mockReturnValue({ mutateAsync: create, isPending: false })
    const { container } = renderPage()
    fireEvent.click(screen.getByText('Add another time'))
    expect(customRows(container)).toHaveLength(2)
    fillRow(container, 1, 2, '18:30')
    await waitFor(() => expect(screen.getAllByText('Bo')).toHaveLength(2))
    expect(screen.getAllByText('No timezone set')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Propose 2 times' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    const args = create.mock.calls[0][0] as { slots: unknown[] }
    expect(args.slots).toHaveLength(2)
    expect(navigate).toHaveBeenCalledWith('/cluster/c1/meetups')
  })

  it('flags early-morning member times with Early there, never on the own row', async () => {
    hooks.useClusterMembers.mockReturnValue({
      data: [
        ...members,
        { id: 'u4', display_name: 'Hal', avatar_url: null, timezone: 'Pacific/Honolulu' },
      ],
      isPending: false,
    })
    const { container } = renderPage()
    fireEvent.click(screen.getByText('Add another time'))
    // Noon UTC reads as 2am in Honolulu regardless of the device zone.
    const noon = new Date(Date.now() + 2 * 24 * 3600_000)
    noon.setUTCHours(12, 0, 0, 0)
    const row = customRows(container)[1] as HTMLElement
    fireEvent.change(within(row).getByLabelText('Option 2 day'), {
      target: { value: noon.toISOString().slice(0, 10) },
    })
    fireEvent.change(within(row).getByLabelText('Option 2 time'), {
      target: { value: '12:00' },
    })
    await waitFor(() => expect(within(row).getByText('Early there')).toBeTruthy())
    // Zero-padded hour keeps the time column aligned regardless of DST.
    const halRow = within(row).getByText('Hal').closest('li') as HTMLElement
    expect(within(halRow).getByText(/\d\d:\d\d [AP]M/)).toBeTruthy()
    // Self row carries the You pill by the time, never a Late/Early pill.
    expect(within(row).getByText('You')).toBeTruthy()
    const allyRow = within(row).getByText('Ally').closest('li') as HTMLElement
    expect(within(allyRow).queryByText('Early there')).toBeNull()
    expect(within(allyRow).queryByText('Late there')).toBeNull()
  })

  it('defaults the timezone selector to the profile zone', () => {
    renderPage()
    const select = screen.getByLabelText('Meeting timezone') as HTMLSelectElement
    expect(select.value).toBe('Europe/Lisbon')
  })

  it('reinterprets wall times when the timezone changes', async () => {
    const create = vi.fn().mockResolvedValue('m1')
    hooks.useCreateMeetup.mockReturnValue({ mutateAsync: create, isPending: false })
    const { container } = renderPage()
    fireEvent.click(screen.getByText('Add another time'))
    const day = localDateInput(2)
    fillRow(container, 1, 2, '18:30')
    fireEvent.change(screen.getByLabelText('Meeting timezone'), {
      target: { value: 'America/New_York' },
    })
    await waitFor(() => expect(
      (screen.getByLabelText('Meeting timezone') as HTMLSelectElement).value,
    ).toBe('America/New_York'))
    fireEvent.click(screen.getByRole('button', { name: 'Propose 2 times' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    const args = create.mock.calls[0][0] as { slots: Array<{ starts_at: string }> }
    const second = args.slots.find((s) => s.starts_at !== args.slots[0].starts_at)
    expect(second?.starts_at).toBe(zonedTimeToISO(day, '18:30', 'America/New_York'))
  })

  it('removes rows and flags out-of-window times', () => {
    const { container } = renderPage()
    fireEvent.click(screen.getByText('Add another time'))
    expect(customRows(container)).toHaveLength(2)
    fillRow(container, 1, 0, '00:01')
    expect(screen.getByText('Pick a time at least 3 hours out and within the next 7 days.')).toBeTruthy()
    removeRow(1)
    expect(customRows(container)).toHaveLength(1)
  })

  it('disables remove in the option menu while it is the last row', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'More options for option 1' }))
    expect(screen.getByRole('menuitem', { name: 'Remove option' })).toBeDisabled()
  })
})
