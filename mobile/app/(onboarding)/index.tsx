import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../src/auth-context'
import { useActiveAccountGate } from '../../src/lib/use-active-account'
import { requireSupabase } from '../../src/lib/supabase'
import { modeInfo } from '../../src/lib/modes'
import { joinQueueErrorMessage, toErrorMessage } from '../../src/lib/error'
import { profileKey, useProfile } from '../../src/lib/use-profile'
import {
  EMPTY_DRAFT,
  validateStep,
  type OnboardingDraft,
} from '../../src/lib/onboarding-draft'
import { radii } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { PrimaryButton, SecondaryButton } from '../../src/components/ui'
import { BrandMark } from '../../src/components/BrandMark'
import { BrandWordmark } from '../../src/components/BrandWordmark'
import { StepProfile } from '../../src/components/onboarding/StepProfile'
import { StepCustomization } from '../../src/components/onboarding/StepCustomization'
import { StepModes } from '../../src/components/onboarding/StepModes'
import { StepLocal } from '../../src/components/onboarding/StepLocal'
import { StepReview } from '../../src/components/onboarding/StepReview'

const TOTAL_STEPS = 5

export default function OnboardingScreen() {
  const t = useTheme()
  const auth = useAuth()
  useActiveAccountGate('member')
  const profile = useProfile()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const completed = !profile.isLoading && !!profile.data?.onboarding_completed_at

  useEffect(() => {
    if (auth.state !== 'signedIn') router.replace('/(auth)/login')
    else if (completed) router.replace('/(app)/home')
  }, [auth.state, completed])

  if (auth.state !== 'signedIn' || profile.isLoading || completed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.primary} />
      </SafeAreaView>
    )
  }

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

      const { error: updateError } = await supabase.from('profiles').upsert(
        {
          id: userId,
          email: userEmail ?? '',
          display_name: draft.displayName.trim(),
          pronouns: draft.pronouns.trim() || null,
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

      const { error: completeError } = await supabase
        .from('profiles')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', userId)
      if (completeError) throw completeError

      await queryClient.invalidateQueries({ queryKey: profileKey(userId) })
      router.replace('/(app)/home')
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <BrandMark size={28} />
          <BrandWordmark size={16} />
        </View>
        <Text style={{ marginTop: 16, fontSize: 14, fontWeight: '600', color: t.primary }}>
          Step {step} of {TOTAL_STEPS}
        </Text>
        <View style={{ marginTop: 8, height: 4, borderRadius: 2, backgroundColor: t.surfaceContainer }}>
          <View
            style={{ height: '100%', borderRadius: 2, backgroundColor: t.primary, width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </View>

        <View
          style={{ marginTop: 16, backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 20 }}
        >
          {step === 1 ? <StepProfile draft={draft} patch={patch} /> : null}
          {step === 2 ? <StepCustomization userId={userId} draft={draft} patch={patch} /> : null}
          {step === 3 ? <StepModes draft={draft} patch={patch} /> : null}
          {step === 4 ? <StepLocal draft={draft} patch={patch} /> : null}
          {step === 5 ? <StepReview draft={draft} /> : null}

          {error ? <Text style={{ marginTop: 16, fontSize: 14, color: t.error }}>{error}</Text> : null}

          <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SecondaryButton title="Back" onPress={goBack} disabled={step === 1 || submitting} />
            <View style={{ flex: 2 }}>
              {step < TOTAL_STEPS ? (
                <PrimaryButton title="Continue" onPress={goNext} />
              ) : (
                <PrimaryButton title="Join Queue(s)" loadingTitle="Joining…" onPress={submit} loading={submitting} />
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
