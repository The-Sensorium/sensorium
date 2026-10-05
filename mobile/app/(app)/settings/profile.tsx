import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { ArrowLeft, Clock, ImageMinus, ImagePlus, Save, UserRound } from 'lucide-react-native'
import { useProfile } from '../../../src/lib/use-profile'
import { toErrorMessage } from '../../../src/lib/error'
import { useUpdateProfile } from '../../../src/features/cluster'
import { deleteAvatarObject, uploadAvatar } from '../../../src/features/avatars'
import { Avatar } from '../../../src/components/Avatar'
import { Modal } from '../../../src/components/Modal'
import { PronounField } from '../../../src/components/PronounField'
import { TimezonePicker } from '../../../src/components/TimezonePicker'
import { Field, PrimaryButton } from '../../../src/components/ui'
import { radii } from '../../../src/lib/theme-tokens'
import { useTheme } from '../../../src/lib/use-theme'
import { Card, Screen } from '../../../src/components/ui'

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default function EditProfileScreen() {
  const t = useTheme()
  const profile = useProfile()
  const [name, setName] = useState(profile.data?.display_name ?? '')
  const [bio, setBio] = useState(profile.data?.bio ?? '')
  const [pronouns, setPronouns] = useState(profile.data?.pronouns ?? '')
  const [status, setStatus] = useState(profile.data?.current_status ?? '')
  const [timezone, setTimezone] = useState(profile.data?.timezone ?? '')
  const [removeAvatarOpen, setRemoveAvatarOpen] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const updateProfile = useUpdateProfile()

  // Profile loads async; pick up the saved zone once it arrives so saving
  // another field never wipes a value the user never touched.
  useEffect(() => {
    setTimezone(profile.data?.timezone ?? '')
  }, [profile.data?.timezone])

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
      const userId = profile.data?.id
      if (!userId) throw new Error('Profile not loaded yet.')
      const path = await uploadAvatar(userId, asset.uri, mime, asset.width ?? 0, asset.height ?? 0)
      await updateProfile.mutateAsync({ avatar_url: path })
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
  const timezoneDirty = (timezone || '') !== (profile.data?.timezone ?? '')

  return (
    <Screen avoiding>
      <Pressable
        onPress={() => {
          if (router.canGoBack()) router.back()
          else router.replace('/(app)/settings')
        }}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 12, minHeight: 48, paddingRight: 16, marginBottom: 12 }}
      >
        <ArrowLeft size={18} color={t.primary} strokeWidth={2} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.primary }}>
          Back
        </Text>
      </Pressable>
      <Text style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.2, fontWeight: '600', color: t.onSurface, marginBottom: 16 }} accessibilityRole="header">
        Edit profile
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
              accessibilityRole="button"
              accessibilityState={{ disabled: avatarUploading }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, opacity: avatarUploading ? 0.6 : 1 }}
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
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, opacity: updateProfile.isPending ? 0.6 : 1 }}
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
              label="About"
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
                quietDisabled
                icon={<Save size={16} color={t.onPrimary} strokeWidth={2} />}
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
            <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Status message</Text>
          </View>
          <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
            Shown on your member card in every cluster.
          </Text>
          <View style={{ marginTop: 16, gap: 12 }}>
            <TextInput
              value={status}
              onChangeText={setStatus}
              maxLength={60}
              placeholder="e.g. Deep in a good book"
              placeholderTextColor={t.onSurfaceVariant}
              style={{
                backgroundColor: t.surfaceContainer,
                borderWidth: 1,
                borderColor: t.outlineVariant,
                borderRadius: radii.pill,
                paddingHorizontal: 16,
                paddingVertical: 10,
                fontSize: 16,
                lineHeight: 24,
                minHeight: 48,
                color: t.onSurface,
              }}
            />
            <PrimaryButton
              title="Save changes"
              loading={updateProfile.isPending}
              disabled={!statusDirty}
              quietDisabled
              icon={<Save size={16} color={t.onPrimary} strokeWidth={2} />}
              onPress={() => void updateProfile.mutateAsync({ current_status: status.trim() || null })}
            />
          </View>
        </View>
      </Card>

      <Card>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Clock size={20} color={t.primary} strokeWidth={1.5} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Local time</Text>
          </View>
          <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
            Shown on your member card in every cluster.
          </Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            <TimezonePicker value={timezone} onChange={setTimezone} placeholder="Not set" />
            <PrimaryButton
              title="Save changes"
              loading={updateProfile.isPending}
              disabled={!timezoneDirty}
              quietDisabled
              icon={<Save size={16} color={t.onPrimary} strokeWidth={2} />}
              onPress={() => void updateProfile.mutateAsync({ timezone: timezone || null })}
            />
          </View>
        </View>
      </Card>

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
