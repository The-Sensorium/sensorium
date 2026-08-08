import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ThemeToggle } from '../../components/theme-toggle'
import { useAuth } from '../../app/auth-context'
import { requireSupabase } from '../../lib/supabase'
import { useProfile, profileKey } from '../../lib/use-profile'
import { useDocumentTitle } from '../../lib/use-document-title'
import { modeInfo } from '../../lib/modes'
import { joinQueueErrorMessage, toErrorMessage } from '../../lib/error'
import { StepProfile } from './step-profile'
import { StepCustomization } from './step-customization'
import { StepModes } from './step-modes'
import { StepLocal } from './step-local'
import { StepReview } from './step-review'
import { EMPTY_DRAFT, validateStep, type OnboardingDraft } from './draft'

const TOTAL_STEPS = 5

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export function OnboardingPage() {
  useDocumentTitle('Onboarding')
  const auth = useAuth()
  const profile = useProfile()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (auth.state !== 'signedIn') return null
  if (profile.isLoading) return <Loading />
  if (profile.data?.onboarding_completed_at) return <Navigate to="/home" replace />

  const userId = auth.userId
  const userEmail = auth.email

  function patch(updates: Partial<OnboardingDraft>) {
    setDraft((d) => ({ ...d, ...updates }))
  }

  function goNext() {
    const validationError = validateStep(step, draft)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    if (step === 3 && !draft.selectedModes.includes('local')) {
      setStep(5)
    } else {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS))
    }
  }

  function goBack() {
    setError(null)
    if (step === 5 && !draft.selectedModes.includes('local')) {
      setStep(3)
    } else {
      setStep((s) => Math.max(s - 1, 1))
    }
  }

  async function submit() {
    const validationError = validateStep(5, draft)
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const supabase = requireSupabase()

      // 1. save profile fields (keep onboarding incomplete so join errors stay recoverable)
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            email: userEmail ?? '',
            display_name: draft.displayName.trim(),
            dob: draft.dob,
            country_code: draft.countryCode,
            bio: draft.bio.trim() || null,
            avatar_url: draft.avatarUrl,
            latitude: draft.coordinates?.lat ?? null,
            longitude: draft.coordinates?.lng ?? null,
            local_area: draft.localArea ?? null,
            local_radius_km: draft.radiusKm ?? null,
          },
          { onConflict: 'id' },
        )
      if (updateError) throw updateError

      // 2. join each selected mode queue
      const failed: string[] = []
      for (const mode of draft.selectedModes) {
        const { error: joinError } = await supabase.rpc('join_queue', {
          p_mode: mode,
          p_radius_km: draft.radiusKm ?? undefined,
        })
        if (joinError) failed.push(`${modeInfo(mode).label}: ${joinQueueErrorMessage(joinError)}`)
      }

      if (failed.length > 0) {
        setError(`Some queues couldn’t be joined yet: ${failed.join(' ')}`)
        setSubmitting(false)
        return
      }

      // 3. only mark onboarding complete when all queues joined successfully
      const { error: completeError } = await supabase
        .from('profiles')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', userId)
      if (completeError) throw completeError

      await queryClient.invalidateQueries({ queryKey: profileKey(userId) })
      navigate('/home', { replace: true })
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <div className="fixed right-4 top-4 z-30">
        <ThemeToggle />
      </div>

      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-6 pt-8">
        <Link to="/" className="font-brand text-lg tracking-[0.15em]">
          Sensorium
        </Link>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-16 pt-10">
        <p className="text-sm font-semibold text-primary">Step {step} of {TOTAL_STEPS}</p>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-container">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <div className="mt-6 rounded-2xl bg-surface-lowest p-6 shadow-soft sm:p-8">
          {step === 1 && <StepProfile draft={draft} patch={patch} />}
          {step === 2 && <StepCustomization userId={userId} draft={draft} patch={patch} />}
          {step === 3 && <StepModes draft={draft} patch={patch} />}
          {step === 4 && <StepLocal draft={draft} patch={patch} />}
          {step === 5 && <StepReview draft={draft} />}

          {error && <p className="mt-5 text-sm text-error">{error}</p>}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1 || submitting}
              className="rounded-pill border border-outline px-6 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
            >
              Back
            </button>
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
              >
                {submitting ? 'Joining…' : 'Join Queue(s)'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
