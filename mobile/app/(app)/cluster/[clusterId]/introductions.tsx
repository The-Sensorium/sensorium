import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Sparkles } from 'lucide-react-native'
import {
  useCluster,
  useMyMembership,
  useIntroQuestions,
  useSubmitIntroAnswers,
} from '../../../../src/features/introductions'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import {
  Card,
  Field,
  LoadingView,
  PrimaryButton,
  Screen,
} from '../../../../src/components/ui'
import { CountdownTimer } from '../../../../src/components/CountdownTimer'

export default function IntroductionsScreen() {
  const t = useTheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const cluster = useCluster(clusterId || null)
  const membership = useMyMembership(clusterId || null)
  const questions = useIntroQuestions(clusterId !== '')

  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const submit = useSubmitIntroAnswers()

  const done = !!membership.data?.intro_completed_at
  useEffect(() => {
    if (done) router.replace({ pathname: '/cluster/[clusterId]/waiting', params: { clusterId } })
  }, [done, clusterId])

  if (cluster.isLoading || membership.isLoading || questions.isLoading) {
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

  if (done) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    )
  }

  const deadline = cluster.data.introductions_deadline
  const allAnswered =
    (questions.data?.length ?? 0) > 0 &&
    (questions.data ?? []).every((q) => (answers[q.id] ?? '').trim().length > 0)

  async function handleSubmit() {
    if (!allAnswered || !clusterId) return
    setError(null)
    try {
      await submit.mutateAsync({ clusterId, answers })
      router.replace({ pathname: '/cluster/[clusterId]/waiting', params: { clusterId } })
    } catch {
      setError('Something went wrong saving your answers. Please try again.')
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        Introductions · {cluster.data.name}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 28, fontWeight: '600', color: t.onSurface }}>
        Tell your cluster who you are
      </Text>
      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Sparkles size={16} color={t.primary} strokeWidth={1.5} />
        <Text style={{ flex: 1, fontSize: 14, color: t.onSurfaceVariant }}>
          {cluster.data.introductions_completed_at ? (
            'This room is already open. Answer below to join the conversation.'
          ) : (
            <>
              Chat unlocks once everyone answers. Deadline:{' '}
              {deadline ? <CountdownTimer deadline={deadline} /> : null}
            </>
          )}
        </Text>
      </View>

      {(questions.data ?? []).map((q, i) => (
        <View
          key={q.id}
          style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 20, marginBottom: 16 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
            {i + 1}. {q.prompt}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Field
              label=""
              value={answers[q.id] ?? ''}
              onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
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
        <Text style={{ fontSize: 14, color: t.error, marginBottom: 16 }}>{error}</Text>
      ) : null}

      <PrimaryButton
        title={cluster.data.introductions_completed_at ? 'Finish introductions' : 'Submit introductions'}
        loadingTitle="Saving…"
        loading={submit.isPending}
        onPress={() => void handleSubmit()}
      />
    </Screen>
  )
}
