import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Sparkles } from 'lucide-react-native'
import {
  useCluster,
  useMyMembership,
  useIntroQuestions,
  useSubmitIntroAnswers,
} from '../../../../src/features/introductions'
import { useMemberIntroAnswers } from '../../../../src/features/cluster'
import { useAuth } from '../../../../src/auth-context'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { useProvidedAppearanceId } from '../../../../src/lib/cluster-theme'
import { ClusterThemeProvider } from '../../../../src/lib/cluster-theme'
import {
  Card,
  Field,
  LoadingView,
  PrimaryButton,
  Screen,
} from '../../../../src/components/ui'

export default function IntroductionsScreen() {
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  return (
    <ClusterThemeProvider clusterId={clusterId || null}>
      <IntroductionsScreenContent />
    </ClusterThemeProvider>
  )
}

function IntroductionsScreenContent() {
  const t = useTheme()
  const themed = useProvidedAppearanceId() !== 'default'
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const authUserId = auth.state === 'signedIn' ? auth.userId : null
  const cluster = useCluster(clusterId || null)
  const membership = useMyMembership(clusterId || null)
  const questions = useIntroQuestions(clusterId !== '')
  const ownAnswers = useMemberIntroAnswers(clusterId || null, authUserId)

  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const submit = useSubmitIntroAnswers()
  const seededRef = useRef(false)
  const touchedRef = useRef(false)

  useEffect(() => {
    seededRef.current = false
    touchedRef.current = false
    setAnswers({})
  }, [clusterId])

  useEffect(() => {
    if (seededRef.current || touchedRef.current) return
    const rows = ownAnswers.data ?? []
    if (rows.length === 0) return
    setAnswers(Object.fromEntries(rows.map((r) => [r.question_id, r.answer])))
    seededRef.current = true
  }, [ownAnswers.data])

  const isEdit = (ownAnswers.data ?? []).length > 0

  if (cluster.isLoading || membership.isLoading || questions.isLoading || ownAnswers.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    )
  }

  if (!cluster.data) {
    return (
      <Screen>
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            This cluster isn’t available to you.
          </Text>
        </Card>
      </Screen>
    )
  }

  const allAnswered =
    (questions.data?.length ?? 0) > 0 &&
    (questions.data ?? []).every((q) => (answers[q.id] ?? '').trim().length > 0)

  async function handleSubmit() {
    if (!allAnswered || !clusterId) return
    setError(null)
    try {
      await submit.mutateAsync({ clusterId, answers })
      router.replace({ pathname: '/cluster/[clusterId]/room', params: { clusterId } })
    } catch {
      setError('Something went wrong saving your answers. Please try again.')
    }
  }

  return (
    <Screen avoiding>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        Introductions · {cluster.data.name}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 24, lineHeight: 30, fontWeight: '600', color: t.onSurface }}>
        {isEdit ? 'Edit your introductions' : 'Tell your cluster who you are'}
      </Text>
      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Sparkles size={16} color={t.primary} strokeWidth={1.5} />
        <Text style={{ flex: 1, fontSize: 14, color: t.onSurfaceVariant }}>
          {isEdit ? 'Update anything that changed.' : 'Answer below to share who you are.'}
        </Text>
      </View>

      {(questions.data ?? []).map((q, i) => (
        <View
          key={q.id}
          style={{
            backgroundColor: themed ? t.surface : t.surfaceLowest,
            borderWidth: 1,
            borderColor: themed ? t.outlineVariant : 'transparent',
            borderRadius: radii.xl,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <Text
            style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}
            accessibilityLabel={`${i + 1}. ${q.prompt} (required)`}
          >
            {i + 1}. {q.prompt}{' '}
            <Text style={{ color: t.error }} aria-hidden={true}>
              *
            </Text>
          </Text>
          <View style={{ marginTop: 12 }}>
            <Field
              label=""
              value={answers[q.id] ?? ''}
              onChangeText={(v) => {
                touchedRef.current = true
                setAnswers((a) => ({ ...a, [q.id]: v }))
              }}
              maxLength={1000}
              multiline
              numberOfLines={3}
              placeholder="Write a few honest sentences…"
              autoCapitalize="sentences"
              style={{ minHeight: 88, textAlignVertical: 'top' }}
            />
          </View>
          <Text style={{ fontSize: 12, color: (answers[q.id] ?? '').trim() ? t.onSurfaceVariant : t.error }}>
            {(answers[q.id] ?? '').trim() ? 'Answered' : 'Required'}
          </Text>
        </View>
      ))}

      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ fontSize: 14, color: t.error, marginBottom: 16 }}>{error}</Text>
      ) : null}

      <PrimaryButton
        title={isEdit ? 'Save changes' : 'Save introductions'}
        loadingTitle="Saving…"
        loading={submit.isPending}
        disabled={!allAnswered}
        quietDisabled
        onPress={() => void handleSubmit()}
      />
    </Screen>
  )
}
