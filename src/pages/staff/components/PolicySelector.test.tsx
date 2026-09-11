import { useState } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PolicySelector, type PolicyChoice } from './PolicySelector'

const hooks = vi.hoisted(() => ({
  useModerationPolicies: vi.fn(),
}))

vi.mock('../../../features/admin-moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../features/admin-moderation')>()
  return { ...actual, useModerationPolicies: hooks.useModerationPolicies }
})

const rows = [
  {
    category_code: 'spam',
    category_title: 'Spam',
    default_severity: 'low',
    recommended_action: 'Warn first; suspend on repeat.',
    template_code: 'spam_first_warning',
    template_title: 'First warning',
    user_notice: 'Your post was removed as spam.',
    internal_guidance: 'Use for first-time spam.',
  },
  {
    category_code: 'spam',
    category_title: 'Spam',
    default_severity: 'low',
    recommended_action: 'Warn first; suspend on repeat.',
    template_code: 'spam_repeat_suspension',
    template_title: 'Repeat suspension',
    user_notice: 'Suspended for repeated spam.',
    internal_guidance: 'Use for repeat flooding.',
  },
  {
    category_code: 'harassment',
    category_title: 'Harassment',
    default_severity: 'high',
    recommended_action: 'Warn first; suspend on repeat.',
    template_code: 'harassment_first_warning',
    template_title: 'First warning',
    user_notice: 'Your message violated our harassment policy.',
    internal_guidance: 'First low-severity finding.',
  },
]

function renderSelector(onChange = vi.fn(), onUseNotice = vi.fn(), initial: PolicyChoice = { categoryCode: 'spam', template: null }) {
  function Harness() {
    const [choice, setChoice] = useState<PolicyChoice>(initial)
    return (
      <PolicySelector
        choice={choice}
        onChange={(c) => {
          setChoice(c)
          onChange(c)
        }}
        onUseNotice={onUseNotice}
      />
    )
  }
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PolicySelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useModerationPolicies.mockReturnValue({ data: rows, isLoading: false, isError: false })
  })

  it('shows recommended action for the chosen category', () => {
    renderSelector()
    expect(screen.getByText(/Warn first; suspend on repeat/)).toBeInTheDocument()
    expect(screen.getByLabelText('Policy category')).toBeInTheDocument()
  })

  it('reveals template guidance and fills the notice on demand', () => {
    const onUseNotice = vi.fn()
    renderSelector(vi.fn(), onUseNotice)
    fireEvent.change(screen.getByLabelText('Notice template'), { target: { value: 'spam_first_warning' } })
    expect(screen.getByText('Use for first-time spam.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use this notice' }))
    expect(onUseNotice).toHaveBeenCalledWith('Your post was removed as spam.')
  })

  it('switching category clears the template', () => {
    const onChange = vi.fn()
    renderSelector(onChange)
    fireEvent.change(screen.getByLabelText('Notice template'), { target: { value: 'spam_first_warning' } })
    fireEvent.change(screen.getByLabelText('Policy category'), { target: { value: 'harassment' } })
    expect(onChange).toHaveBeenLastCalledWith({ categoryCode: 'harassment', template: null })
  })

  it('renders nothing when policies fail to load', () => {
    hooks.useModerationPolicies.mockReturnValue({ data: [], isLoading: false, isError: true })
    const { container } = renderSelector()
    expect(container.textContent).toBe('')
  })
})
