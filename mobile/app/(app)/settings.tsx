import { useEffect, useState } from 'react'
import { ActivityIndicator, Animated, Pressable, Text, TextInput, View } from 'react-native'
import { Link, router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { AlertTriangle, BellRing, ImageMinus, ImagePlus, LogOut, MonitorSmartphone, Moon, ShieldCheck, Sun, Trash2, UserRound } from 'lucide-react-native'
import { useProfile } from '../../src/lib/use-profile'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { useMyClusters } from '../../src/features/matching'
import { useUpdateProfile } from '../../src/features/cluster'
import { deleteAvatarObject } from '../../src/features/avatars'
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
import { PronounField } from '../../src/components/PronounField'
import { Field, PrimaryButton } from '../../src/components/ui'
import { readImageBytes } from '../../src/lib/upload-image'
import { useThemeChoice, type ThemeChoice } from '../../src/lib/theme-choice'
import { radii } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, LoadingView, Screen } from '../../src/components/ui'

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default function SettingsScreen() {
  const t = useTheme()
  const profile = useProfile()
  const [name, setName] = useState(profile.data?.display_name ?? '')
  const [bio, setBio] = useState(profile.data?.bio ?? '')
  const [pronouns, setPronouns] = useState(profile.data?.pronouns ?? '')
  const [status, setStatus] = useState(profile.data?.current_status ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [removeAvatarOpen, setRemoveAvatarOpen] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const updateProfile = useUpdateProfile()

  async function handleAvatar() {
    setAvatarError(null)
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    const mime = asset.mimeType ?? 'image/jpeg'
    if (!ACCEPTED_MIME.includes(mime)) {
      setAvatarError('Please choose a JPG, PNG, WebP, or GIF image.')
      return
    }
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setAvatarError('That image is larger than 5 MB.')
      return
    }
    setAvatarUploading(true)
    try {
      const supabase = requireSupabase()
      const userId = profile.data?.id ?? 'me'
      let uri = asset.uri
      let outMime = mime
      const maxDim = Math.max(asset.width ?? 0, asset.height ?? 0)
      if (mime !== 'image/gif' && maxDim > 512) {
        const out = await manipulateAsync(uri, [{ resize: { width: 512 } }], {
          compress: 0.85,
          format: SaveFormat.WEBP,
        })
        uri = out.uri
        outMime = 'image/webp'
      }
      const ext = outMime === 'image/png' ? 'png' : outMime === 'image/gif' ? 'gif' : outMime === 'image/jpeg' ? 'jpg' : 'webp'
      const path = `${userId}/${Date.now()}.${ext}`
      const body = await readImageBytes(uri)
      const { data, error } = await supabase.storage.from('avatars').upload(path, body, {
        cacheControl: '31536000',
        upsert: false,
        contentType: outMime,
      })
      if (error) throw error
      await updateProfile.mutateAsync({ avatar_url: data.path })
      await deleteAvatarObject(profile.data?.avatar_url ?? null).catch(() => {})
    } catch (err) {
      setAvatarError(toErrorMessage(err, 'Couldn’t upload your photo.'))
    } finally {
      setAvatarUploading(false)
    }
  }

  const profileDirty =
    name.trim() !== (profile.data?.display_name ?? '') ||
    bio.trim() !== (profile.data?.bio ?? '') ||
    pronouns.trim() !== (profile.data?.pronouns ?? '')
  const statusDirty = status.trim() !== (profile.data?.current_status ?? '')

  return (
    <Screen avoiding>
      <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface, marginBottom: 16 }}>
        Settings
      </Text>

      <Card>
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
            <Avatar name={profile.data?.display_name ?? 'You'} src={profile.data?.avatar_url} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                {profile.data?.display_name ?? 'You'}
              </Text>
              <Text style={{ fontSize: 14, color: t.onSurfaceVariant }} numberOfLines={1}>
                {profile.data?.email ?? ''}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => void handleAvatar()}
              disabled={avatarUploading}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8, opacity: avatarUploading ? 0.6 : 1 }}
            >
              {avatarUploading ? (
                <ActivityIndicator size="small" color={t.onSurface} />
              ) : (
                <ImagePlus size={16} color={t.onSurface} strokeWidth={1.5} />
              )}
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                {profile.data?.avatar_url ? 'Change' : 'Upload photo'}
              </Text>
            </Pressable>
            {profile.data?.avatar_url ? (
              <Pressable
                accessibilityLabel="Remove photo"
                onPress={() => setRemoveAvatarOpen(true)}
                disabled={updateProfile.isPending}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8, opacity: updateProfile.isPending ? 0.6 : 1 }}
              >
                <ImageMinus size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                  Remove
                </Text>
              </Pressable>
            ) : null}
          </View>
          {avatarError ? (
            <Text style={{ marginTop: 8, fontSize: 14, color: t.error }}>{avatarError}</Text>
          ) : null}

          <View style={{ marginTop: 16 }}>
            <Field
              label="Display name"
              value={name}
              onChangeText={setName}
              maxLength={40}
              placeholder="What members see"
              autoCapitalize="words"
            />
            <PronounField value={pronouns} onChange={setPronouns} />
            <Field
              label="Bio"
              value={bio}
              onChangeText={setBio}
              maxLength={500}
              multiline
              numberOfLines={3}
              placeholder="A few sentences so your cluster knows who you are."
              autoCapitalize="sentences"
              style={{ minHeight: 88, textAlignVertical: 'top' }}
            />
            <Text style={{ textAlign: 'right', fontSize: 12, color: t.onSurfaceVariant }}>
              {bio.length}/500
            </Text>
            {updateProfile.isError ? (
              <Text style={{ marginTop: 8, fontSize: 14, color: t.error }}>
                Couldn’t save your changes. Please try again.
              </Text>
            ) : null}
            <View style={{ marginTop: 12 }}>
              <PrimaryButton
                title="Save changes"
                loading={updateProfile.isPending}
                disabled={!profileDirty}
                onPress={() =>
                  void updateProfile.mutateAsync({
                    display_name: name.trim() || undefined,
                    bio: bio.trim() || null,
                    pronouns: pronouns.trim() || null,
                  })
                }
              />
            </View>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <UserRound size={20} color={t.primary} strokeWidth={1.5} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Status</Text>
          </View>
          <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
            Shown on your member card in every cluster.
          </Text>
          <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={status}
              onChangeText={setStatus}
              maxLength={80}
              placeholder="e.g. Deep in a good book"
              placeholderTextColor={t.onSurfaceVariant}
              style={{
                flex: 1,
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
            <PrimaryButton
              title="Save"
              loading={updateProfile.isPending}
              disabled={!statusDirty}
              onPress={() => void updateProfile.mutateAsync({ current_status: status.trim() || null })}
            />
          </View>
        </View>
      </Card>

      <NotificationPreferences />
      <SafetySection />
      <AppearanceSection />

      <Card>
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Account</Text>
          <View style={{ marginTop: 16, gap: 8 }}>
            <Pressable
              onPress={() => setDeleteOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.error, borderRadius: radii.pill, paddingVertical: 12 }}
            >
              <Trash2 size={16} color={t.error} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.error }}>
                Delete account
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSignOutOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12 }}
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
          <Pressable style={{ padding: 8 }}>
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>Privacy Policy</Text>
          </Pressable>
        </Link>
        <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>·</Text>
        <Link href="/terms" asChild>
          <Pressable style={{ padding: 8 }}>
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>Terms of Service</Text>
          </Pressable>
        </Link>
      </View>

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
      <SignOutConfirmModal open={signOutOpen} onClose={() => setSignOutOpen(false)} />
      <RemoveAvatarModal
        open={removeAvatarOpen}
        onClose={() => setRemoveAvatarOpen(false)}
        avatarUrl={profile.data?.avatar_url ?? null}
      />
    </Screen>
  )
}

function RemoveAvatarModal({ open, onClose, avatarUrl }: { open: boolean; onClose: () => void; avatarUrl: string | null }) {
  const t = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const updateProfile = useUpdateProfile()

  async function handleRemove() {
    setError(null)
    setPending(true)
    try {
      await updateProfile.mutateAsync({ avatar_url: null })
      await deleteAvatarObject(avatarUrl).catch(() => {})
      onClose()
    } catch {
      setError('Could not remove your photo. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Remove photo?">
      <View style={{ marginTop: 12, gap: 16 }}>
        <Text style={{ fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
          Your photo will be removed from your profile, and members will see your initials instead.
        </Text>
        {error ? <Text style={{ fontSize: 14, color: t.error }}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={onClose}
            disabled={pending}
            style={{ flex: 1, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12, alignItems: 'center', opacity: pending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Remove photo" loading={pending} onPress={() => void handleRemove()} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme()
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const deleteAccount = useDeleteAccount()

  async function handleDelete() {
    setError(null)
    try {
      await deleteAccount.mutateAsync()
      router.replace('/')
    } catch {
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
      await supabase.auth.signOut()
      queryClient.clear()
      router.replace('/(auth)/login')
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
                  paddingVertical: 10,
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
            style={{ marginTop: 12, borderWidth: 1, borderColor: t.primary, borderRadius: radii.pill, paddingVertical: 10, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 20 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>My reports</Text>
          </Pressable>
        </Link>
        <View style={{ marginTop: 16 }}>
          {mutes.isLoading ? (
            <LoadingView />
          ) : mutes.isError ? (
            <Text style={{ fontSize: 14, color: t.error }}>
              Couldn’t load your muted members. Please try again.
            </Text>
          ) : muted.length === 0 ? (
            <View style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.md, padding: 16 }}>
              <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>No muted members.</Text>
            </View>
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

        {clusters.isLoading || prefs.isLoading ? (
          <View style={{ marginTop: 16 }}>
            <LoadingView />
          </View>
        ) : clusters.isError || prefs.isError ? (
          <Text style={{ marginTop: 16, fontSize: 14, color: t.error }}>
            Couldn’t load your preferences. Please try again.
          </Text>
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
            {(clusters.data ?? []).map(({ cluster }) => (
              <View key={cluster.id} style={{ borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.md, padding: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                  {cluster.name}
                </Text>
                <View style={{ marginTop: 12, gap: 12 }}>
                  {PREF_TOGGLES.map((key) => {
                    const value = prefFor(cluster.id, key)
                    const saving = pending[`${cluster.id}:${key}`] !== undefined
                    return (
                      <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                        <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>{PREF_LABELS[key]}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {saving ? <ActivityIndicator size="small" color={t.onSurfaceVariant} /> : null}
                          <Toggle checked={value} label={PREF_LABELS[key]} onChange={(v) => toggle(cluster.id, key, v)} />
                        </View>
                      </View>
                    )
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </Card>
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
      onPress={() => onChange(!checked)}
    >
      <Animated.View
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          backgroundColor,
          justifyContent: 'center',
          paddingHorizontal: 2,
        }}
      >
        <Animated.View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: t.surfaceLowest,
            transform: [{ translateX }],
          }}
        />
      </Animated.View>
    </Pressable>
  )
}
