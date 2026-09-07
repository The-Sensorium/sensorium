import { useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native'
import { Link, router } from 'expo-router'
import { AlertOctagon, LogOut, MailWarning, ShieldAlert } from 'lucide-react-native'
import { requireSupabase } from '../src/lib/supabase'
import { useMyAppeal } from '../src/features/appeals'
import { useActiveAccountGate } from '../src/lib/use-active-account'
import { useMyAccess } from '../src/features/access'
import { useDeleteAccount } from '../src/features/moderation'
import { radii, spacing } from '../src/lib/theme-tokens'
import { useTheme } from '../src/lib/use-theme'
import { PrimaryButton } from '../src/components/ui'
import { BrandWordmark } from '../src/components/BrandWordmark'

export default function RestrictedScreen() {
  const t = useTheme()
  useActiveAccountGate('restricted')
  const access = useMyAccess()
  const appeal = useMyAppeal()
  const deleteAccount = useDeleteAccount()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (access.isLoading || access.isError || !access.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', padding: spacing.containerMargin }}>
        {access.isLoading ? (
          <ActivityIndicator size="large" color={t.primary} />
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
              Couldn’t load your account status.
            </Text>
            <View style={{ marginTop: 16 }}>
              <PrimaryButton title="Try Again" onPress={() => void access.refetch()} />
            </View>
          </View>
        )}
      </SafeAreaView>
    )
  }

  const status = access.data.account_status
  const suspended = status === 'suspended'
  const appealAvailable = (appeal.data?.length ?? 0) > 0

  async function signOut() {
    try {
      const supabase = requireSupabase()
      await supabase.auth.signOut()
      router.replace('/(auth)/login')
    } catch {
      setError('Could not sign out. Please try again.')
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await deleteAccount.mutateAsync()
    } catch {
      setError('Could not delete your account. Please try again.')
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.containerMargin }}>
        <View style={{ marginBottom: 24 }}>
          <BrandWordmark size={18} />
        </View>
        <View style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 32, alignItems: 'center' }}>
          <View
            style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: t.errorContainer, alignItems: 'center', justifyContent: 'center' }}
          >
            <ShieldAlert size={28} color={t.error} strokeWidth={1.5} />
          </View>
          <Text style={{ marginTop: 16, fontSize: 22, fontWeight: '600', color: t.onSurface }}>
            {suspended ? 'Account suspended' : 'Account restricted'}
          </Text>
          <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 22, textAlign: 'center', color: t.onSurfaceVariant }}>
            {suspended
              ? 'Your account is temporarily unavailable. If you think this is a mistake, you can appeal the decision.'
              : 'Your account is no longer able to use Sensorium. If you think this is a mistake, you can appeal the decision.'}
          </Text>
          {suspended && access.data.restriction_expires_at ? (
            <Text style={{ marginTop: 12, fontSize: 14, fontWeight: '600', color: t.onSurface }}>
              Your access resumes on {new Date(access.data.restriction_expires_at).toLocaleDateString()}.
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: 24, gap: 12 }}>
          {error ? (
            <View style={{ backgroundColor: t.errorContainer, borderRadius: radii.md, padding: 12 }}>
              <Text style={{ fontSize: 14, color: t.error }}>{error}</Text>
            </View>
          ) : null}

          {confirming ? (
            <View style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <AlertOctagon size={16} color={t.error} strokeWidth={1.5} />
                <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
                  Deleting your account permanently removes it. This cannot be undone.
                </Text>
              </View>
              <PrimaryButton
                title="Delete my account"
                loading={deleteAccount.isPending}
                onPress={() => void handleDelete()}
              />
              <Pressable
                onPress={() => setConfirming(false)}
                style={{ borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                  Keep my account
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Link href="/appeal" asChild>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: t.primary, borderRadius: radii.pill, paddingVertical: 14 }}
                >
                  <MailWarning size={16} color={t.onPrimary} strokeWidth={1.5} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>
                    {appealAvailable ? 'Review your appeal' : 'Appeal this decision'}
                  </Text>
                </Pressable>
              </Link>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => void signOut()}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 10 }}
                >
                  <LogOut size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                    Sign out
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirming(true)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.error, borderRadius: radii.pill, paddingVertical: 10 }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.error }}>
                    Delete my account
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
