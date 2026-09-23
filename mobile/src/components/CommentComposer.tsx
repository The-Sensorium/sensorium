import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { CornerUpLeft, ImagePlay, ImagePlus, Send, X } from 'lucide-react-native'
import { Avatar } from './Avatar'
import { CollapsibleChrome } from './CollapsibleChrome'
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
  const sendDisabled = !hasContent || create.isPending
  const gifActive = Boolean(gif) || gifOpen
  // While typing, the avatar and media buttons hide so the text gets the
  // full width; Send stays visible outside the input container.
  // Whitespace alone keeps the chrome: hiding for a lone space would serve
  // nothing since send stays disabled until there is real content.
  const isTyping = draft.trim().length > 0

  function handleDraftChange(value: string) {
    setDraft(value)
    // The GIF toggle hides while typing, so a stranded open picker must not
    // linger above the composer without its trigger visible.
    if (value.trim().length > 0) setGifOpen(false)
  }

  return (
    <View>
      {replyTo ? (
        <View style={{ marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surfaceLowest, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 4 }}>
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
      {image || gif ? (
        <View style={{ marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
      {gifOpen ? (
        <View style={{ marginBottom: 8 }}>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            // Same input surface as the cluster chat composer in both modes.
            backgroundColor: t.surfaceLowest,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.md,
            paddingLeft: 6,
            paddingRight: 4,
            paddingVertical: 4,
          }}
        >
          <CollapsibleChrome shown={!isTyping} width={32}>
            <Avatar name={selfAvatar.display_name} src={selfAvatar.avatar_url} size={32} />
          </CollapsibleChrome>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={handleDraftChange}
            maxLength={COMMENT_CONTENT_MAX}
            multiline
            // No numberOfLines: on Android it pins the field to an exact line
            // count, which would stop the composer growing with wrapped text.
            placeholder="Add a comment..."
            placeholderTextColor={t.onSurfaceVariant}
            accessibilityLabel="Add a comment"
            style={{
              flex: 1,
              paddingHorizontal: 8,
              paddingVertical: 10,
              fontSize: 16,
              lineHeight: 22,
              maxHeight: 110,
              textAlignVertical: 'center',
              color: t.onSurface,
            }}
          />
          <CollapsibleChrome shown={!isTyping} width={44}>
            <Pressable
              accessibilityLabel="Attach image"
              accessibilityRole="button"
              onPress={() => void handlePickImage()}
              hitSlop={8}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <ImagePlus size={22} color={image ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
            </Pressable>
          </CollapsibleChrome>
          <CollapsibleChrome shown={!isTyping} width={44}>
            <Pressable
              accessibilityLabel="Add a GIF"
              accessibilityRole="button"
              onPress={() => setGifOpen((o) => !o)}
              hitSlop={8}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  borderWidth: 1.5,
                  borderColor: gifActive ? t.primary : t.onSurfaceVariant,
                  borderRadius: 6,
                  paddingHorizontal: 5,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: gifActive ? t.primary : t.onSurfaceVariant }}>
                  GIF
                </Text>
              </View>
            </Pressable>
          </CollapsibleChrome>
        </View>
        <Pressable
          disabled={sendDisabled}
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          accessibilityState={{ disabled: sendDisabled }}
          onPress={() => void handleComment()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: sendDisabled ? 0.4 : 1,
          }}
        >
          {create.isPending ? (
            <ActivityIndicator size="small" color={t.onPrimary} />
          ) : (
            <Send size={20} color={t.onPrimary} strokeWidth={1.5} />
          )}
        </Pressable>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ marginTop: 4, fontSize: 12, color: t.error }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
