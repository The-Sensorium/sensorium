import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, Animated, Pressable, Text, TextInput, View } from 'react-native'
import { Link, router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BellRing, ChevronDown, LogOut, MonitorSmartphone, Moon, Pencil, ShieldCheck, Sun, Trash2 } from 'lucide-react-native'
import { useProfile } from '../../src/lib/use-profile'
import { goLogin } from '../../src/lib/auth-navigation'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { errorHaptic, lightHaptic, successHaptic } from '../../src/lib/haptics'
import { useMyClusters } from '../../src/features/matching'
import { useDeleteAccount, useMyMutes } from '../../src/features/moderation'
import {
  PREF_LABELS,
  PREF_TOGGLES,
  useNotificationPrefs,
  useUpsertNotificationPrefs,
  type PrefToggle,
} from '../../src/features/notifications'
import { Avatar } from '../../src/components/Avatar'
import { MuteButton } from '../../src/components/MuteButton'
import { Modal } from '../../src/components/Modal'
import { PrimaryButton } from '../../src/components/ui'
import { useThemeChoice, type ThemeChoice } from '../../src/lib/theme-choice'
import { radii, shadowShape } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, LoadingView, Screen } from '../../src/components/ui'
import { PushPermissionPrompt } from '../../src/components/PushPermissionPrompt'

export default function SettingsScreen() {
  const t = useTheme()
  const profile = useProfile()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)

  return (
    <Screen avoiding>
      <Text style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.2, fontWeight: '600', color: t.onSurface, marginBottom: 16 }} accessibilityRole="header">
        Settings
      </Text>

      <Link href="/(app)/settings/profile" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.xl,
            padding: 16,
            marginBottom: 16,
            ...shadowShape,
            shadowColor: t.shadowColor,
          }}
        >
          <Avatar name={profile.data?.display_name ?? 'You'} src={profile.data?.avatar_url} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
              {profile.data?.display_name ?? 'You'}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: t.onSurfaceVariant }} numberOfLines={1}>
              {profile.data?.current_status ?? profile.data?.email ?? ''}
            </Text>
          </View>
          <View
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Pencil size={18} color={t.onPrimary} strokeWidth={1.5} />
          </View>
        </Pressable>
      </Link>

      <NotificationPreferences />
      <AppearanceSection />
      <SafetySection />

      <Card>
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Account</Text>
          <View style={{ marginTop: 16, gap: 8 }}>
            <Pressable
              onPress={() => setDeleteOpen(true)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.error, borderRadius: radii.pill, paddingVertical: 12, minHeight: 48 }}
            >
              <Trash2 size={16} color={t.error} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.error }}>
                Delete account
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSignOutOpen(true)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12, minHeight: 48 }}
            >
              <LogOut size={16} color={t.onSurface} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                Sign out
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}>
        <Link href="/privacy-policy" asChild>
          <Pressable hitSlop={8} style={{ padding: 12, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }}>Privacy Policy</Text>
          </Pressable>
        </Link>
        <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>·</Text>
        <Link href="/terms" asChild>
          <Pressable hitSlop={8} style={{ padding: 12, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }}>Terms of Service</Text>
          </Pressable>
        </Link>
      </View>

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
      <SignOutConfirmModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </Screen>
  )
}

function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme()
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const deleteAccount = useDeleteAccount()

  useEffect(() => {
    if (open) {
      setConfirm('')
      setError(null)
    }
  }, [open])

  async function handleDelete() {
    if (confirm.trim() !== 'DELETE') return
    setError(null)
    try {
      await deleteAccount.mutateAsync()
      successHaptic()
      router.replace('/')
    } catch {
      errorHaptic()
      setError('Could not delete your account. Please try again.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete account">
      <View style={{ marginTop: 12, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 12, backgroundColor: t.surfaceContainer, borderRadius: radii.md, padding: 16 }}>
          <AlertTriangle size={20} color={t.error} strokeWidth={1.5} />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
            This permanently deletes your profile, messages, signals and memberships. This cannot
            be undone. To confirm, type <Text style={{ fontWeight: '600', color: t.error }}>DELETE</Text>.
          </Text>
        </View>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Type DELETE to confirm"
          placeholderTextColor={t.onSurfaceVariant}
          autoCapitalize="characters"
          style={{
            backgroundColor: t.surfaceContainer,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.pill,
            paddingHorizontal: 16,
            paddingVertical: 10,
            fontSize: 14,
            color: t.onSurface,
          }}
        />
        {error ? <Text style={{ fontSize: 14, color: t.error }}>{error}</Text> : null}
        <PrimaryButton
          title="Delete my account"
          loadingTitle="Deleting…"
          loading={deleteAccount.isPending}
          disabled={confirm.trim() !== 'DELETE'}
          tone="error"
          onPress={() => void handleDelete()}
        />
      </View>
    </Modal>
  )
}

function SignOutConfirmModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    setError(null)
    setPending(true)
    try {
      const supabase = requireSupabase()
      const { unregisterPushToken } = await import('../../src/lib/push')
      const { teardownRealtime } = await import('../../src/lib/supabase')
      await unregisterPushToken()
      await supabase.auth.signOut()
      await teardownRealtime()
      queryClient.clear()
      onClose()
      goLogin()
    } catch {
      setError('Could not sign out. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Sign out?">
      <View style={{ marginTop: 12, gap: 16 }}>
        <Text style={{ fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
          You&apos;ll need to sign back in to see your clusters and conversations.
        </Text>
        {error ? <Text style={{ fontSize: 14, color: t.error }}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={onClose}
            disabled={pending}
            style={{ flex: 1, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12, alignItems: 'center', opacity: pending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Sign out" loading={pending} onPress={() => void handleSignOut()} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: MonitorSmartphone },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function AppearanceSection() {
  const t = useTheme()
  const { choice, setChoice } = useThemeChoice()

  return (
    <Card>
      <View style={{ marginBottom: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Appearance</Text>
        <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
          Light, dark, or follow your system.
        </Text>
        <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
          {THEME_OPTIONS.map((option) => {
            const active = choice === option.value
            const Icon = option.icon
            return (
              <Pressable
                key={option.value}
                onPress={() => setChoice(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${option.label} theme`}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderWidth: 1,
                  borderColor: active ? t.primary : t.outlineVariant,
                  backgroundColor: active ? t.surfaceContainer : 'transparent',
                  borderRadius: radii.pill,
                  paddingVertical: 14,
                  minHeight: 48,
                }}
              >
                <Icon size={16} color={active ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
                <Text
                  style={{ fontSize: 14, fontWeight: '600', color: active ? t.primary : t.onSurface }}
                >
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </Card>
  )
}

function SafetySection() {
  const t = useTheme()
  const mutes = useMyMutes()
  const muted = mutes.data ?? []

  return (
    <Card>
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={20} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Safety</Text>
        </View>
        <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
          Muted members are hidden for you only. They are never told.
        </Text>
        <Link
          href="/(app)/settings/reports"
          asChild
        >
          <Pressable
            hitSlop={4}
            style={{ marginTop: 12, borderWidth: 1, borderColor: t.primary, borderRadius: radii.pill, paddingVertical: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 20 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>My reports</Text>
          </Pressable>
        </Link>
        {(mutes.isLoading || mutes.isError || muted.length > 0) && (
          <View style={{ marginTop: 16 }}>
            {mutes.isLoading ? (
              <LoadingView />
            ) : mutes.isError ? (
              <>
                <Text style={{ fontSize: 14, color: t.error }}>
                  Couldn’t load your muted members. Please try again.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Try loading muted members again"
                  hitSlop={8}
                  onPress={() => void mutes.refetch()}
                  style={{ marginTop: 4, paddingVertical: 8, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
                    Try again
                  </Text>
                </Pressable>
              </>
            ) : (
              muted.map((m) => (
                <View
                  key={m.muted_user_id}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 8 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <Avatar name={m.display_name ?? 'Member'} src={m.avatar_url} size={32} />
                    <Text style={{ fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                      {m.display_name ?? 'Member'}
                    </Text>
                  </View>
                  <MuteButton targetUserId={m.muted_user_id} targetName={m.display_name ?? 'Member'} />
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </Card>
  )
}

function NotificationPreferences() {
  const t = useTheme()
  const clusters = useMyClusters()
  const prefs = useNotificationPrefs()
  const upsert = useUpsertNotificationPrefs()
  const [pending, setPending] = useState<Record<string, boolean | undefined>>({})
  const [prefError, setPrefError] = useState<string | null>(null)

  const byCluster = new Map((prefs.data ?? []).map((p) => [p.cluster_id, p]))
  const list = useMemo(() => clusters.data ?? [], [clusters.data])
  const [expandedIds, setExpandedIds] = useState<readonly string[] | null>(null)
  // Latch the single-cluster default once seen so joining a second cluster
  // mid-session doesn't snap the open card shut. Other counts keep deriving
  // until the user touches a card, so a lone remaining cluster still opens.
  useEffect(() => {
    setExpandedIds((prev) => prev ?? (list.length === 1 ? [list[0].cluster.id] : prev))
  }, [list])
  const openIds = expandedIds ?? (list.length === 1 ? [list[0].cluster.id] : [])

  function setOpen(clusterId: string, open: boolean) {
    setExpandedIds((prev) => {
      const base = prev ?? (list.length === 1 ? [list[0].cluster.id] : [])
      return open ? [...new Set([...base, clusterId])] : base.filter((id) => id !== clusterId)
    })
  }

  function prefFor(clusterId: string, toggle: PrefToggle): boolean {
    const pendingValue = pending[`${clusterId}:${toggle}`]
    if (pendingValue !== undefined) return pendingValue
    return byCluster.get(clusterId)?.[toggle] ?? true
  }

  function toggle(clusterId: string, key: PrefToggle, value: boolean) {
    const current: Record<PrefToggle, boolean> = {
      messages: false,
      mentions: false,
      reactions: false,
      votes: false,
      meetups: false,
      invitations: false,
      signals: false,
      post_comment: false,
      post_like: false,
    }
    const existing = byCluster.get(clusterId)
    for (const toggleKey of PREF_TOGGLES) current[toggleKey] = existing?.[toggleKey] ?? true
    current[key] = value
    setPending((p) => ({ ...p, [`${clusterId}:${key}`]: value }))
    setPrefError(null)
    upsert
      .mutateAsync({ clusterId, toggles: current })
      .catch((err: unknown) => setPrefError(toErrorMessage(err, 'Couldn’t save your preferences.')))
      .finally(() => setPending((p) => ({ ...p, [`${clusterId}:${key}`]: undefined })))
  }

  return (
    <Card>
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BellRing size={20} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>
            Notification preferences
          </Text>
        </View>
        <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
          Tune what lands in your notification center, per cluster.
        </Text>

        <View style={{ marginTop: 16 }}>
          <PushPermissionPrompt compact />
        </View>

        {clusters.isLoading || prefs.isLoading ? (
          <View style={{ marginTop: 16 }}>
            <LoadingView />
          </View>
        ) : clusters.isError || prefs.isError ? (
          <>
            <Text style={{ marginTop: 16, fontSize: 14, color: t.error }}>
              Couldn’t load your preferences. Please try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try loading preferences again"
              hitSlop={8}
              onPress={() => {
                void clusters.refetch()
                void prefs.refetch()
              }}
              style={{ marginTop: 4, paddingVertical: 8, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
                Try again
              </Text>
            </Pressable>
          </>
        ) : (clusters.data ?? []).length === 0 ? (
          <View style={{ marginTop: 16, backgroundColor: t.surfaceContainer, borderRadius: radii.md, padding: 16 }}>
            <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
              No clusters yet. Preferences appear here once you join a cluster.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 16, gap: 16 }}>
            {prefError ? (
              <Text style={{ fontSize: 14, color: t.error }}>{prefError}</Text>
            ) : null}
            {list.map(({ cluster }) => {
              const open = openIds.includes(cluster.id)
              const off = PREF_TOGGLES.filter((key) => !prefFor(cluster.id, key)).length
              const summary = off === 0 ? 'All on' : off === PREF_TOGGLES.length ? 'All off' : `${off} off`
              return (
                <ClusterPrefCard
                  key={cluster.id}
                  name={cluster.name}
                  summary={summary}
                  open={open}
                  onOpenChange={(next) => setOpen(cluster.id, next)}
                >
                  <View style={{ gap: 2 }}>
                    {PREF_TOGGLES.map((key) => {
                      const value = prefFor(cluster.id, key)
                      const saving = pending[`${cluster.id}:${key}`] !== undefined
                      return (
                        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 36, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>{PREF_LABELS[key]}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {saving ? <ActivityIndicator size="small" color={t.onSurfaceVariant} /> : null}
                            <Toggle checked={value} label={PREF_LABELS[key]} onChange={(v) => toggle(cluster.id, key, v)} />
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </ClusterPrefCard>
              )
            })}
          </View>
        )}
      </View>
    </Card>
  )
}

function ClusterPrefCard({
  name,
  summary,
  open,
  onOpenChange,
  children,
}: {
  name: string
  summary: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const t = useTheme()
  return (
    <View style={{ borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.xl, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${name}, notification settings, ${summary}`}
        onPress={() => onOpenChange(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: t.onSurfaceVariant }}>{summary}</Text>
        </View>
        <ChevronDown
          size={16}
          color={t.onSurfaceVariant}
          strokeWidth={1.5}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{children}</View> : null}
    </View>
  )
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  const t = useTheme()
  const [anim] = useState(() => new Animated.Value(checked ? 1 : 0))

  useEffect(() => {
    Animated.timing(anim, { toValue: checked ? 1 : 0, duration: 160, useNativeDriver: false }).start()
  }, [anim, checked, t.primary, t.outlineVariant])

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 20] })
  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [t.outlineVariant, t.primary],
  })

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      onPress={() => {
        lightHaptic()
        onChange(!checked)
      }}
      hitSlop={8}
      style={{ minHeight: 32, minWidth: 48, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          backgroundColor,
          justifyContent: 'center',
          paddingHorizontal: 2,
        }}
      >
        <Animated.View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: t.surfaceLowest,
            transform: [{ translateX }],
          }}
        />
      </Animated.View>
    </Pressable>
  )
}
