import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { ImagePlus, X } from 'lucide-react-native'
import { requireSupabase } from '../../lib/supabase'
import { readImageBytes } from '../../lib/upload-image'
import { toErrorMessage } from '../../lib/error'
import { deleteAvatarObject, useAvatarUrl } from '../../features/avatars'
import type { OnboardingDraft } from '../../lib/onboarding-draft'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { Field } from '../ui'

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

async function uploadAvatar(userId: string, uri: string, mime: string): Promise<string> {
  const supabase = requireSupabase()
  const ext = mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'webp'
  const path = `${userId}/${Date.now()}.${ext}`
  const body = await readImageBytes(uri)
  const { data, error } = await supabase.storage.from('avatars').upload(path, body, {
    cacheControl: '31536000',
    upsert: false,
    contentType: mime,
  })
  if (error) throw error
  return data.path
}

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
  const { data: avatarSrc } = useAvatarUrl(draft.avatarUrl)
  const preview = draft.photoUri ?? avatarSrc ?? null

  async function pick() {
    setError(null)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    const mime = asset.mimeType ?? 'image/jpeg'
    if (!ACCEPTED_MIME.includes(mime)) {
      setError('Please choose a JPG, PNG, WebP, or GIF image.')
      return
    }
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setError('That image is larger than 5 MB.')
      return
    }
    setUploading(true)
    try {
      const maxDim = Math.max(asset.width ?? 0, asset.height ?? 0)
      const finalUri =
        mime === 'image/gif' || maxDim <= 512
          ? asset.uri
          : (
              await manipulateAsync(asset.uri, [{ resize: { width: 512 } }], {
                compress: 0.85,
                format: SaveFormat.WEBP,
              })
            ).uri
      const finalMime = finalUri === asset.uri ? mime : 'image/webp'
      const url = await uploadAvatar(userId, finalUri, finalMime)
      await deleteAvatarObject(draft.avatarUrl ?? null).catch(() => {})
      patch({ photoUri: finalUri, avatarUrl: url })
    } catch (err) {
      setError(toErrorMessage(err, 'Couldn’t upload your photo.'))
    } finally {
      setUploading(false)
    }
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
          style={{
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.pill,
            paddingHorizontal: 16,
            paddingVertical: 8,
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
              void deleteAvatarObject(draft.avatarUrl ?? null).catch(() => {})
              patch({ photoUri: null, avatarUrl: null })
            }}
            style={{ padding: 8 }}
          >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        ) : null}
        {uploading ? <ActivityIndicator color={t.primary} /> : null}
      </View>
      {error ? <Text style={{ marginTop: 8, fontSize: 14, color: t.error }}>{error}</Text> : null}

      <View style={{ marginTop: 16 }}>
        <Field
          label="Bio"
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
