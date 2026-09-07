import { useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native'
import { Link } from 'expo-router'
import { Clock3, MailWarning, Send } from 'lucide-react-native'
import { useMyAccess } from '../src/features/access'
import { useActiveAccountGate } from '../src/lib/use-active-account'
import { APPEAL_STATUS_LABELS, useMyAppeal, useSubmitAppeal } from '../src/features/appeals'
import { timeAgo } from '../src/features/notifications'
import { radii, spacing } from '../src/lib/theme-tokens'
import { useTheme } from '../src/lib/use-theme'
import { PrimaryButton } from '../src/components/ui'

const MAX_DETAILS = 5000

function formatError(message: string): string {
  if (message.includes('details_required')) return 'Please tell us why you’re appealing the decision.'
  if (message.includes('details_too_long')) return `Appeals are limited to ${MAX_DETAILS.toLocaleString()} characters.`
  if (message.includes('account_not_restricted'))
    return 'Your account is not restricted, so there is nothing to appeal right now.'
  return message
}

export default function AppealScreen() {
  const t = useTheme()
  useActiveAccountGate('restricted')
  const access = useMyAccess()
  const appeals = useMyAppeal()
  const submit = useSubmitAppeal()
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (access.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={t.primary} />
      </SafeAreaView>
    )
  }

  const current = appeals.data?.[0] ?? null
  const restricted =
    access.data?.account_status === 'suspended' || access.data?.account_status === 'banned'
  const open = current?.status === 'submitted'

  async function handleSubmit() {
    setError(null)
    setSuccess(null)
    try {
      await submit.mutateAsync(details)
      setSuccess('Your appeal has been submitted. We’ll review it and send you the outcome.')
      setDetails('')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(formatError(message))
    }
  }

  const needsForm = restricted && !open

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.containerMargin }}>
        <View style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}
            >
              <MailWarning size={24} color={t.primary} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '600', color: t.onSurface }}>
                Appeal a decision
              </Text>
              <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                {access.data?.account_status === 'suspended' ? 'About your suspension' : 'About your account'}
              </Text>
            </View>
          </View>

          {!access.data ? (
            <Text style={{ marginTop: 24, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
              Couldn’t load your account status.
            </Text>
          ) : open && current ? (
            <View style={{ marginTop: 24, gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock3 size={20} color={t.onSurfaceVariant} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                  {APPEAL_STATUS_LABELS[current.status]}
                </Text>
                <Text style={{ marginLeft: 'auto', fontSize: 12, color: t.onSurfaceVariant }}>
                  {timeAgo(current.created_at)}
                </Text>
              </View>
              <View style={{ backgroundColor: t.surface, borderRadius: radii.md, padding: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
                  Your appeal
                </Text>
                <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurface }}>
                  {current.details}
                </Text>
              </View>
              <Text style={{ fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
                Appeals are reviewed by our staff. You’ll receive the outcome at the email address on your account.
              </Text>
            </View>
          ) : (
            <>
              {current?.status === 'resolved' && current.response ? (
                <View style={{ marginTop: 24, backgroundColor: t.surfaceContainer, borderRadius: radii.md, padding: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
                    Previous outcome
                  </Text>
                  <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurface }}>
                    {current.response}
                  </Text>
                </View>
              ) : null}

              <Text style={{ marginTop: 24, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
                {access.data.account_status === 'suspended'
                  ? 'Your account is temporarily suspended. If you think this is a mistake, appeal the decision below.'
                  : 'Your account has been restricted. If you think this is a mistake, appeal the decision below.'}
              </Text>

              <Text style={{ marginTop: 24, fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                Why should this be reconsidered?
              </Text>
              <TextInput
                value={details}
                onChangeText={setDetails}
                maxLength={MAX_DETAILS}
                multiline
                numberOfLines={6}
                placeholder="Tell us what happened in your own words."
                placeholderTextColor={t.onSurfaceVariant}
                style={{
                  marginTop: 8,
                  backgroundColor: t.surface,
                  borderWidth: 1,
                  borderColor: t.outlineVariant,
                  borderRadius: radii.xl,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 14,
                  lineHeight: 22,
                  minHeight: 144,
                  textAlignVertical: 'top',
                  color: t.onSurface,
                }}
              />
              <Text style={{ marginTop: 4, textAlign: 'right', fontSize: 12, color: t.onSurfaceVariant }}>
                {details.length.toLocaleString()} / {MAX_DETAILS.toLocaleString()}
              </Text>

              {error ? (
                <View style={{ marginTop: 12, backgroundColor: t.errorContainer, borderRadius: radii.md, padding: 12 }}>
                  <Text style={{ fontSize: 14, color: t.error }}>{error}</Text>
                </View>
              ) : null}
              {success ? (
                <View style={{ marginTop: 12, backgroundColor: t.surfaceContainer, borderRadius: radii.md, padding: 12 }}>
                  <Text style={{ fontSize: 14, color: t.onSurface }}>{success}</Text>
                </View>
              ) : null}

              <View style={{ marginTop: 16 }}>
                <PrimaryButton
                  title="Submit appeal"
                  loading={submit.isPending}
                  onPress={() => void handleSubmit()}
                />
              </View>
              {!details.trim() && !submit.isPending ? (
                <Text style={{ marginTop: 8, fontSize: 12, textAlign: 'center', color: t.onSurfaceVariant }}>
                  Write something above to enable submission.
                </Text>
              ) : null}
            </>
          )}
        </View>

        <Link href="/restricted" asChild>
          <Pressable style={{ marginTop: 24, alignItems: 'center', padding: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: t.onSurfaceVariant }}>
              Back to account status
            </Text>
          </Pressable>
        </Link>

        {!needsForm ? (
          <Text style={{ textAlign: 'center', fontSize: 12, lineHeight: 18, color: t.onSurfaceVariant }}>
            You can also sign out from the account status page if you’re done.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
