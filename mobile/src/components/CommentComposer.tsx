import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { CornerUpLeft, ImagePlay, ImagePlus, Send, X } from 'lucide-react-native'
import { Avatar } from './Avatar'
import { GifPicker } from './room/GifPicker'
import {
  useCreateComment,
  uploadPostImage,
  COMMENT_CONTENT_MAX,
  type PostComment,
} from '../features/posts'
import type { Gif } from '../features/gifs'
import { toErrorMessage } from '../lib/error'
import { errorHaptic, successHaptic } from '../lib/haptics'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { resolveParentCommentId, type ReplyTarget } from './comment-helpers'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

interface PickedImage {
  uri: string
  mime: string
  width: number
  height: number
}

export function CommentComposer({
  clusterId,
  postId,
  comments,
  replyTo,
  selfAvatar,
  onCancelReply,
  onPosted,
}: {
  clusterId: string
  postId: string
  comments: PostComment[]
  replyTo: ReplyTarget | null
  selfAvatar: { display_name: string; avatar_url: string | null }
  onCancelReply(): void
  onPosted(): void
}) {
  const t = useTheme()
  const [draft, setDraft] = useState('')
  const [image, setImage] = useState<PickedImage | null>(null)
  const [gif, setGif] = useState<Gif | null>(null)
  const [gifOpen, setGifOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<TextInput>(null)
  const create = useCreateComment(clusterId)

  const replyId = replyTo?.id
  useEffect(() => {
    if (!replyId) return
    // The composer is a single always-mounted input (Instagram pattern), so
    // the ref is stable — but focus must still wait a frame for the
    // "Replying to" chip layout to commit, otherwise Android drops the
    // keyboard open request made against a stale layout frame. A delayed
    // retry covers the cases where the first request still loses the race
    // (observed as Reply taps that set the chip but never open the keyboard).
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    const retry = setTimeout(() => {
      inputRef.current?.focus()
    }, 120)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(retry)
    }
  }, [replyId])

  // The reply target comes from this same list, so a miss is usually a
  // transient refetch gap rather than a deletion. Only cancel once the
  // target was seen in a loaded list and is now gone from a non-empty one.
  // Posting already falls back to top-level via resolveParentCommentId
  // regardless, so a missed notice is harmless.
  const seenReplyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!replyTo) {
      seenReplyRef.current = null
      return
    }
    if (comments.some((c) => c.id === replyTo.id)) {
      seenReplyRef.current = replyTo.id
      return
    }
    if (seenReplyRef.current === replyTo.id && comments.length > 0) {
      onCancelReply()
      setError('The comment you were replying to is no longer available. Posting as a top-level comment instead.')
    }
  }, [comments, replyTo, onCancelReply])

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
    setImage({ uri: asset.uri, mime, width: asset.width ?? 0, height: asset.height ?? 0 })
  }

  async function handleComment() {
    const content = draft.trim()
    if ((!content && !image && !gif) || create.isPending) return
    setError(null)
    const parentCommentId = resolveParentCommentId(comments, replyTo)
    try {
      if (gif) {
        await create.mutateAsync({ postId, content: content || null, gifUrl: gif.url, parentCommentId })
      } else if (image) {
        const path = await uploadPostImage(clusterId, image.uri, image.mime, image.width, image.height)
        await create.mutateAsync({ postId, content: content || null, imageUrl: path, parentCommentId })
      } else {
        await create.mutateAsync({ postId, content: content || null, parentCommentId })
      }
      setDraft('')
      setImage(null)
      setGif(null)
      onPosted()
      successHaptic()
    } catch (e) {
      errorHaptic()
      setError(toErrorMessage(e, 'Could not comment. Try again.'))
    }
  }

  const hasContent = Boolean(draft.trim() || image || gif)

  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Avatar name={selfAvatar.display_name} src={selfAvatar.avatar_url} size={32} />
      <View style={{ flex: 1 }}>
        {replyTo ? (
          <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surfaceLowest, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 8 }}>
            <CornerUpLeft size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ flex: 1, fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
              Replying to <Text style={{ fontWeight: '600', color: t.onSurface }}>{replyTo.authorName}</Text>
            </Text>
            <Pressable
              accessibilityLabel="Cancel reply"
              onPress={onCancelReply}
              hitSlop={14}
              style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            </Pressable>
          </View>
        ) : null}
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          maxLength={COMMENT_CONTENT_MAX}
          multiline
          numberOfLines={2}
          placeholder="Add a comment…"
          placeholderTextColor={t.onSurfaceVariant}
          accessibilityLabel="Add a comment"
          style={{
            backgroundColor: t.surfaceLowest,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.md,
            paddingHorizontal: 16,
            paddingVertical: 10,
            fontSize: 16,
            lineHeight: 24,
            minHeight: 64,
            textAlignVertical: 'top',
            color: t.onSurface,
          }}
        />
        {image || gif ? (
          <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {image?.uri ? (
              <Image source={{ uri: image.uri }} style={{ width: 48, height: 48, borderRadius: radii.md }} />
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              {image ? (
                <ImagePlus size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
              ) : (
                <ImagePlay size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
              )}
              <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                {image ? 'Image attached' : gif?.title || 'GIF'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Remove media"
              onPress={() => {
                setImage(null)
                setGif(null)
              }}
              hitSlop={14}
              style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            </Pressable>
          </View>
        ) : null}
        {error ? <Text style={{ marginTop: 4, fontSize: 12, color: t.error }}>{error}</Text> : null}
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
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable
            accessibilityLabel="Attach image"
            onPress={() => void handlePickImage()}
            hitSlop={4}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 12, minHeight: 48 }}
          >
            <ImagePlus size={16} color={image ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: image ? t.primary : t.onSurfaceVariant }}>
              Image
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Add a GIF"
            onPress={() => setGifOpen((o) => !o)}
            hitSlop={4}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 12, minHeight: 48 }}
          >
            <ImagePlay size={16} color={gif ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: gif ? t.primary : t.onSurfaceVariant }}>
              GIF
            </Text>
          </Pressable>
          <Pressable
            disabled={!hasContent || create.isPending}
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasContent || create.isPending }}
            onPress={() => void handleComment()}
            style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.primary, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 12, minHeight: 48, opacity: !hasContent || create.isPending ? 0.6 : 1 }}
          >
            {create.isPending ? (
              <ActivityIndicator size="small" color={t.onPrimary} />
            ) : (
              <Send size={16} color={t.onPrimary} strokeWidth={1.5} />
            )}
            <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onPrimary }}>Comment</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
