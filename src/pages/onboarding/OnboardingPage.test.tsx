import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingPage } from './OnboardingPage'

const hooks = vi.hoisted(() => ({
  useNavigate: vi.fn(),
  useQueryClient: vi.fn(),
  useAuth: vi.fn(),
  useProfile: vi.fn(),
  profileKey: vi.fn(),
  requireSupabase: vi.fn(),
}))

vi.mock('react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  Navigate: () => null,
  useNavigate: hooks.useNavigate,
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: hooks.useQueryClient }))
vi.mock('../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../lib/use-profile', () => ({ useProfile: hooks.useProfile, profileKey: hooks.profileKey }))
vi.mock('../../lib/supabase', () => ({ requireSupabase: hooks.requireSupabase }))
vi.mock('../../lib/use-document-title', () => ({ useDocumentTitle: () => {} }))
vi.mock('../../components/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('./draft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./draft')>()
  return { ...actual, validateStep: () => null }
})
vi.mock('./step-profile', () => ({
  StepProfile: ({ patch }: { patch: (updates: Record<string, string>) => void }) => (
    <button type="button" onClick={() => patch({ pronouns: 'they/them' })}>
      set pronouns
    </button>
  ),
}))
vi.mock('./step-customization', () => ({ StepCustomization: () => null }))
vi.mock('./step-modes', () => ({ StepModes: () => null }))
vi.mock('./step-local', () => ({ StepLocal: () => null }))
vi.mock('./step-review', () => ({ StepReview: () => null }))

describe('OnboardingPage', () => {
  let from: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useNavigate.mockReturnValue(vi.fn())
    hooks.useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() })
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'u1@example.com' })
    hooks.useProfile.mockReturnValue({ data: { onboarding_completed_at: null }, isLoading: false })
    from = vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })
    hooks.requireSupabase.mockReturnValue({ from, rpc: vi.fn().mockResolvedValue({ error: null }) })
  })

  it('saves the chosen pronouns with the profile on submit', async () => {
    render(<OnboardingPage />)

    fireEvent.click(screen.getByRole('button', { name: 'set pronouns' }))

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    }

    fireEvent.click(screen.getByRole('button', { name: 'Join Queue(s)' }))

    await waitFor(() => {
      expect(from().upsert).toHaveBeenCalledWith(
        expect.objectContaining({ pronouns: 'they/them' }),
        { onConflict: 'id' },
      )
    })
  })
})
