import { useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native'
import { ImagePlus, X } from 'lucide-react-native'
import { toErrorMessage } from '../../lib/error'
import { deleteAvatarObjects, uploadAvatar, useAvatarThumbUrl } from '../../features/avatars'
import { validateAvatarAsset } from '../../lib/upload-image'
import { pickAvatarFromLibrary, takeAvatarPhoto, type PickedAvatar } from '../../lib/pick-avatar'
import type { OnboardingDraft } from '../../lib/onboarding-draft'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { Field } from '../ui'

export function StepCustomization({
  userId,
  draft,
  patch,
}: {
  userId: string
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}) {
  const t = useTheme()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: avatarSrc } = useAvatarThumbUrl(
    draft.avatarThumbUrl ?? draft.avatarUrl,
    draft.avatarUrl,
  )
  const preview = draft.photoUri ?? avatarSrc ?? null

  async function uploadPicked(picked: PickedAvatar) {
    const invalid = validateAvatarAsset(picked.mime, picked.fileSize)
    if (invalid) {
      setError(invalid)
      return
    }
    setUploading(true)
    setError(null)
    let uploaded: { fullPath: string; thumbPath: string } | null = null
    try {
      uploaded = await uploadAvatar(userId, picked.uri, picked.mime, picked.width, picked.height)
      await deleteAvatarObjects(draft.avatarUrl ?? null, draft.avatarThumbUrl ?? null).catch(() => {})
      patch({ photoUri: picked.uri, avatarUrl: uploaded.fullPath, avatarThumbUrl: uploaded.thumbPath })
    } catch (err) {
      if (uploaded) {
        await deleteAvatarObjects(uploaded.fullPath, uploaded.thumbPath).catch(() => {})
      }
      setError(toErrorMessage(err, 'Couldn’t upload your photo.'))
    } finally {
      setUploading(false)
    }
  }

  function pick() {
    setError(null)
    Alert.alert('Add photo', 'Choose a square photo for your profile.', [
      {
        text: 'Choose from library',
        onPress: () => {
          void pickAvatarFromLibrary()
            .then((picked) => {
              if (picked) void uploadPicked(picked)
            })
            .catch((err) => setError(toErrorMessage(err, 'Couldn’t upload your photo.')))
        },
      },
      {
        text: 'Take photo',
        onPress: () => {
          void takeAvatarPhoto()
            .then((picked) => {
              if (picked) void uploadPicked(picked)
            })
            .catch((err) => setError(toErrorMessage(err, 'Couldn’t upload your photo.')))
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '600', color: t.onSurface }}>Make it yours</Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        Both are optional. You can always change them later.
      </Text>

      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Profile photo</Text>
      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {preview ? (
          <Image source={{ uri: preview }} style={{ width: 80, height: 80, borderRadius: 40 }} />
        ) : (
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: t.surfaceContainer,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ImagePlus size={24} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </View>
        )}
        <Pressable
          onPress={pick}
          disabled={uploading}
          accessibilityRole="button"
          style={{
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.pill,
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: 48,
            justifyContent: 'center',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
            {draft.avatarUrl ? 'Change photo' : 'Upload photo'}
          </Text>
        </Pressable>
        {draft.avatarUrl ? (
            <Pressable
              accessibilityLabel="Remove photo"
              onPress={() => {
                void deleteAvatarObjects(draft.avatarUrl ?? null, draft.avatarThumbUrl ?? null).catch(() => {})
                patch({ photoUri: null, avatarUrl: null, avatarThumbUrl: null })
              }}
              hitSlop={12}
              style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
            >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        ) : null}
        {uploading ? <ActivityIndicator color={t.primary} /> : null}
      </View>
      <Text style={{ marginTop: 8, fontSize: 12, color: t.onSurfaceVariant }}>
        Square crop is applied automatically.
      </Text>
      {error ? <Text style={{ marginTop: 8, fontSize: 14, color: t.error }}>{error}</Text> : null}

      <View style={{ marginTop: 16 }}>
        <Field
          label="About"
          value={draft.bio}
          onChangeText={(bio) => patch({ bio })}
          maxLength={500}
          multiline
          numberOfLines={4}
          placeholder="A few sentences so your cluster knows who you are."
          autoCapitalize="sentences"
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />
        <Text style={{ textAlign: 'right', fontSize: 12, color: t.onSurfaceVariant }}>
          {draft.bio.length}/500
        </Text>
      </View>
    </View>
  )
}
