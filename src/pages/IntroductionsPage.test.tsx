import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { IntroductionsPage } from './IntroductionsPage'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useCluster: vi.fn(),
  useMyMembership: vi.fn(),
  useIntroQuestions: vi.fn(),
  useSubmitIntroAnswers: vi.fn(),
  useMemberIntroAnswers: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useParams: () => ({ clusterId: 'c1' }),
    useNavigate: () => navigateMock,
  }
})
vi.mock('../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../features/introductions', () => ({
  useCluster: hooks.useCluster,
  useMyMembership: hooks.useMyMembership,
  useIntroQuestions: hooks.useIntroQuestions,
  useSubmitIntroAnswers: hooks.useSubmitIntroAnswers,
}))
vi.mock('../features/cluster', () => ({
  useMemberIntroAnswers: hooks.useMemberIntroAnswers,
}))

const QUESTIONS = [1, 2, 3, 4, 5].map((id) => ({ id, prompt: `Question ${id}` }))

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <IntroductionsPage />
    </MemoryRouter>,
  )
}

describe('IntroductionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigateMock.mockClear()
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1' })
    hooks.useCluster.mockReturnValue(queryStub({ id: 'c1', name: 'Aurora' }))
    hooks.useMyMembership.mockReturnValue(queryStub({ intro_completed_at: null }))
    hooks.useIntroQuestions.mockReturnValue(queryStub(QUESTIONS))
    hooks.useMemberIntroAnswers.mockReturnValue(queryStub([]))
    hooks.useSubmitIntroAnswers.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    })
  })

  it('renders the first-run form with empty answers', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Tell your cluster who you are' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save introductions' })).toBeDisabled()
  })

  it('does not redirect completed members and prefills answers for editing', () => {
    hooks.useMyMembership.mockReturnValue(queryStub({ intro_completed_at: '2026-01-01' }))
    hooks.useMemberIntroAnswers.mockReturnValue(
      queryStub(QUESTIONS.map((q) => ({ question_id: q.id, answer: `old ${q.id}` }))),
    )
    renderPage()
    expect(screen.getByRole('heading', { name: 'Edit your introductions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(screen.getByLabelText(/1\. Question 1/)).toHaveValue('old 1')
  })

  it('saves edited answers and returns to the room', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    hooks.useMemberIntroAnswers.mockReturnValue(
      queryStub(QUESTIONS.map((q) => ({ question_id: q.id, answer: `old ${q.id}` }))),
    )
    hooks.useSubmitIntroAnswers.mockReturnValue({ mutateAsync, isPending: false })
    renderPage()
    const first = screen.getByLabelText(/1\. Question 1/)
    fireEvent.change(first, { target: { value: 'updated answer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync).toHaveBeenCalledWith({
      clusterId: 'c1',
      answers: expect.objectContaining({ 1: 'updated answer' }),
    })
    expect(navigateMock).toHaveBeenCalledWith('/cluster/c1', { replace: true })
  })
})
