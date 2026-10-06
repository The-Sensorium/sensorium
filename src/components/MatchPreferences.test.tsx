import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgeRangePicker, MatchPreferencesSheet } from './MatchPreferences'
import { useLocalCompatibleCount } from '../features/matching'

vi.mock('../features/matching', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/matching')>()
  return {
    ...actual,
    useLocalCompatibleCount: vi.fn(() => ({ count: 3, isLoading: false, isError: false })),
    useSetLocalAgePrefs: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

const countMock = vi.mocked(useLocalCompatibleCount)

describe('AgeRangePicker', () => {
  it('shows Any age on the full span', () => {
    render(<AgeRangePicker min={18} max={99} onChange={() => undefined} />)
    expect(screen.getByText('Any age')).toBeDefined()
  })

  it('shows the narrowed range label', () => {
    render(<AgeRangePicker min={25} max={35} onChange={() => undefined} />)
    expect(screen.getByText('25 to 35 years')).toBeDefined()
  })

  it('clamps the minimum so it never passes the maximum', () => {
    const onChange = vi.fn()
    render(<AgeRangePicker min={30} max={35} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Minimum age'), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith(35, 35)
  })

  it('clamps the maximum so it never passes the minimum', () => {
    const onChange = vi.fn()
    render(<AgeRangePicker min={30} max={35} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Maximum age'), { target: { value: '20' } })
    expect(onChange).toHaveBeenCalledWith(30, 30)
  })
})

describe('MatchPreferencesSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the mock structure: header copy, sliders, count, warning, save', () => {
    render(
      <MatchPreferencesSheet
        open
        onClose={() => undefined}
        queueKey="IN:thiruvananthapuram:50"
        initialMin={25}
        initialMax={35}
      />,
    )
    expect(screen.getByText('Match preferences')).toBeDefined()
    expect(
      screen.getByText('Choose the age range you’re comfortable being grouped with.'),
    ).toBeDefined()
    expect(screen.getByText('3 people currently match')).toBeDefined()
    expect(
      screen.getByText('Narrower preferences may take longer to form a cluster.'),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDefined()
  })

  it('hides the warning and offers Any age by default', () => {
    render(
      <MatchPreferencesSheet
        open
        onClose={() => undefined}
        queueKey="IN:thiruvananthapuram:50"
        initialMin={null}
        initialMax={null}
      />,
    )
    expect(
      screen.queryByText('Narrower preferences may take longer to form a cluster.'),
    ).toBeNull()
  })

  it('stays closed when open is false', () => {
    render(
      <MatchPreferencesSheet
        open={false}
        onClose={() => undefined}
        queueKey="IN:thiruvananthapuram:50"
        initialMin={null}
        initialMax={null}
      />,
    )
    expect(screen.queryByText('Match preferences')).toBeNull()
  })

  it('says the count is unavailable when the RPC fails', () => {
    countMock.mockReturnValueOnce({ count: null, isLoading: false, isError: true })
    render(
      <MatchPreferencesSheet
        open
        onClose={() => undefined}
        queueKey="IN:thiruvananthapuram:50"
        initialMin={25}
        initialMax={35}
      />,
    )
    expect(screen.getByText('Match count unavailable right now.')).toBeDefined()
  })

  it('falls back to the draft range, not the saved prefs, without a count', () => {
    countMock.mockReturnValueOnce({ count: null, isLoading: false, isError: false })
    render(
      <MatchPreferencesSheet
        open
        onClose={() => undefined}
        queueKey="IN:thiruvananthapuram:50"
        initialMin={null}
        initialMax={null}
      />,
    )
    expect(screen.queryByText('Match count unavailable right now.')).toBeNull()
    expect(screen.queryByText(/saved/)).toBeNull()
  })
})
