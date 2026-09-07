import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { ImagePlay, ImagePlus, Plus, Send, X } from 'lucide-react-native'
import { GifPicker } from './room/GifPicker'
import { useCreatePost, uploadPostImage, POST_CONTENT_MAX, POST_TITLE_MAX } from '../features/posts'
import type { Gif } from '../features/gifs'
import { toErrorMessage } from '../lib/error'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export interface PickedPostImage {
  uri: string
  mime: string
  width: number
  height: number
  name: string
}

export function PostComposer({ clusterId, onPosted }: { clusterId: string; onPosted?: () => void }) {
  const t = useTheme()
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [image, setImage] = useState<PickedPostImage | null>(null)
  const [gif, setGif] = useState<Gif | null>(null)
  const [gifOpen, setGifOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const create = useCreatePost(clusterId)

  async function handlePickImage() {
    setError(null)
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    const mime = asset.mimeType ?? 'image/jpeg'
    if (!ALLOWED_IMAGE_TYPES.has(mime)) {
      setError('Only JPG, PNG, WebP and GIF images are supported.')
      return
    }
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      setError('Images must be 5 MB or smaller.')
      return
    }
    setGif(null)
    setImage({
      uri: asset.uri,
      mime,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      name: asset.fileName ?? 'image',
    })
  }

  async function handlePost() {
    const content = draft.trim()
    const trimmedTitle = title.trim() || null
    if ((!content && !image && !gif) || create.isPending) return
    setError(null)
    try {
      if (gif) {
        await create.mutateAsync({ content: content || null, gifUrl: gif.url, title: trimmedTitle })
      } else if (image) {
        const path = await uploadPostImage(clusterId, image.uri, image.mime, image.width, image.height)
        await create.mutateAsync({ content: content || null, imageUrl: path, title: trimmedTitle })
      } else {
        await create.mutateAsync({ content: content || null, title: trimmedTitle })
      }
      setDraft('')
      setTitle('')
      setImage(null)
      setGif(null)
      onPosted?.()
    } catch (e) {
      setError(toErrorMessage(e, 'Could not post. Try again.'))
    }
  }

  const hasContent = Boolean(draft.trim() || image || gif)

  if (!open) {
    return (
      <Pressable
        accessibilityLabel="New post"
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.primary, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-start', marginBottom: 16 }}
      >
        <Plus size={16} color={t.onPrimary} strokeWidth={2} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>New post</Text>
      </Pressable>
    )
  }

  return (
    <View style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 16, marginBottom: 16 }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        maxLength={POST_TITLE_MAX}
        placeholder="Post title (optional)"
        placeholderTextColor={t.onSurfaceVariant}
        accessibilityLabel="Post title"
        style={{
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.outlineVariant,
          borderRadius: radii.md,
          paddingHorizontal: 16,
          paddingVertical: 10,
          fontSize: 14,
          fontWeight: '600',
          color: t.onSurface,
        }}
      />
      <TextInput
        value={draft}
        onChangeText={setDraft}
        maxLength={POST_CONTENT_MAX}
        multiline
        numberOfLines={3}
        placeholder="Share something with your cluster…"
        placeholderTextColor={t.onSurfaceVariant}
        accessibilityLabel="New post"
        style={{
          marginTop: 8,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.outlineVariant,
          borderRadius: radii.md,
          paddingHorizontal: 16,
          paddingVertical: 12,
          fontSize: 14,
          lineHeight: 22,
          minHeight: 88,
          textAlignVertical: 'top',
          color: t.onSurface,
        }}
      />
      {image || gif ? (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {image?.uri ? (
            <Image source={{ uri: image.uri }} style={{ width: 64, height: 64, borderRadius: radii.md }} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            {image ? (
              <ImagePlus size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            ) : (
              <ImagePlay size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            )}
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
              {image ? image.name : gif?.title || 'GIF'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Remove media"
            onPress={() => {
              setImage(null)
              setGif(null)
            }}
            style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={{ marginTop: 8, fontSize: 12, color: t.error }}>{error}</Text> : null}
      {gifOpen ? (
        <View style={{ marginTop: 8 }}>
          <GifPicker
            pending={create.isPending}
            onSelect={(g) => {
              setGif(g)
              setImage(null)
              setGifOpen(false)
            }}
          />
        </View>
      ) : null}
      <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable
          accessibilityLabel="Attach image"
          onPress={() => void handlePickImage()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <ImagePlus size={16} color={image ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: image ? t.primary : t.onSurfaceVariant }}>
            Image
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Add a GIF"
          onPress={() => setGifOpen((o) => !o)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <ImagePlay size={16} color={gif ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: gif ? t.primary : t.onSurfaceVariant }}>
            GIF
          </Text>
        </Pressable>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable
            disabled={create.isPending}
            onPress={() => {
              setOpen(false)
              setGifOpen(false)
              setError(null)
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, opacity: create.isPending ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
          <Pressable
            disabled={!hasContent || create.isPending}
            onPress={() => void handlePost()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.primary, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 10, opacity: !hasContent || create.isPending ? 0.6 : 1 }}
          >
            {create.isPending ? (
              <ActivityIndicator size="small" color={t.onPrimary} />
            ) : (
              <Send size={16} color={t.onPrimary} strokeWidth={1.5} />
            )}
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>
              {create.isPending ? 'Posting...' : 'Post'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
