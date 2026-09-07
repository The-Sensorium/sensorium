import { useMemo, useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { CornerUpLeft, ImagePlay, ImagePlus, Send, X } from 'lucide-react-native'
import { useAuth } from '../auth-context'
import { Avatar } from './Avatar'
import { CommentItem } from './CommentItem'
import { GifPicker } from './room/GifPicker'
import {
  useClusterCommentLikes,
  useCreateComment,
  useToggleCommentLike,
  uploadPostImage,
  COMMENT_CONTENT_MAX,
  type PostComment,
} from '../features/posts'
import type { Gif } from '../features/gifs'
import { toErrorMessage } from '../lib/error'
import { isMutedAuthor, mutedIds, useMyMutes } from '../features/moderation'
import { MutedPlaceholder } from './MutedPlaceholder'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

interface PickedImage {
  uri: string
  mime: string
  width: number
  height: number
}

export function CommentThread({
  clusterId,
  postId,
  comments,
  memberById,
  selfAvatar,
}: {
  clusterId: string
  postId: string
  comments: PostComment[]
  memberById: Map<string, { id: string; display_name: string; avatar_url: string | null }>
  selfAvatar: { display_name: string; avatar_url: string | null }
}) {
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const [draft, setDraft] = useState('')
  const [image, setImage] = useState<PickedImage | null>(null)
  const [gif, setGif] = useState<Gif | null>(null)
  const [gifOpen, setGifOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const create = useCreateComment(clusterId)

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
    try {
      if (gif) {
        await create.mutateAsync({ postId, content: content || null, gifUrl: gif.url, parentCommentId: replyTo?.id })
      } else if (image) {
        const path = await uploadPostImage(clusterId, image.uri, image.mime, image.width, image.height)
        await create.mutateAsync({ postId, content: content || null, imageUrl: path, parentCommentId: replyTo?.id })
      } else {
        await create.mutateAsync({ postId, content: content || null, parentCommentId: replyTo?.id })
      }
      setDraft('')
      setImage(null)
      setGif(null)
      setReplyTo(null)
    } catch (e) {
      setError(toErrorMessage(e, 'Could not comment. Try again.'))
    }
  }

  const hasContent = Boolean(draft.trim() || image || gif)

  const myMutes = useMyMutes(true)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function reveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }
  const commentIds = comments.map((c) => c.id)
  const commentLikes = useClusterCommentLikes(clusterId, commentIds)
  const toggleCommentLike = useToggleCommentLike(clusterId)

  const byId = new Map(comments.map((c) => [c.id, c]))
  const top: PostComment[] = []
  const topIds = new Set<string>()
  for (const c of comments) {
    if (!c.parent_comment_id) {
      top.push(c)
      topIds.add(c.id)
    }
  }
  const rootOf = (c: PostComment): PostComment | null => {
    let cur = c
    while (cur.parent_comment_id) {
      const parent = byId.get(cur.parent_comment_id)
      if (!parent) return null
      cur = parent
    }
    return cur
  }
  const threads = new Map<string, PostComment[]>()
  const orphans: PostComment[] = []
  for (const c of comments) {
    if (!c.parent_comment_id) continue
    const root = rootOf(c)
    if (root && topIds.has(root.id)) {
      const arr = threads.get(root.id) ?? []
      arr.push(c)
      threads.set(root.id, arr)
    } else {
      orphans.push(c)
    }
  }
  const authorNameOf = (commentId: string) => {
    const c = byId.get(commentId)
    return c ? (memberById.get(c.author_id)?.display_name ?? 'Member') : 'Member'
  }

  const likesByComment = new Map<string, { count: number; mine: boolean }>()
  for (const l of commentLikes.data ?? []) {
    const entry = likesByComment.get(l.comment_id) ?? { count: 0, mine: false }
    entry.count += 1
    if (l.user_id === userId) entry.mine = true
    likesByComment.set(l.comment_id, entry)
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
        Comments ({comments.length})
      </Text>

      <View style={{ marginTop: 12, flexDirection: 'row', gap: 12 }}>
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
                onPress={() => setReplyTo(null)}
                style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
              </Pressable>
            </View>
          ) : null}
          <TextInput
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
              fontSize: 14,
              lineHeight: 20,
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
                style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
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
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <ImagePlus size={16} color={image ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: image ? t.primary : t.onSurfaceVariant }}>
                Image
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Add a GIF"
              onPress={() => setGifOpen((o) => !o)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <ImagePlay size={16} color={gif ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: gif ? t.primary : t.onSurfaceVariant }}>
                GIF
              </Text>
            </Pressable>
            <Pressable
              disabled={!hasContent || create.isPending}
              onPress={() => void handleComment()}
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.primary, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8, opacity: !hasContent || create.isPending ? 0.6 : 1 }}
            >
              {create.isPending ? (
                <ActivityIndicator size="small" color={t.onPrimary} />
              ) : (
                <Send size={16} color={t.onPrimary} strokeWidth={1.5} />
              )}
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>Comment</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 16, gap: 16 }}>
        {myMutes.isLoading ? (
          <ActivityIndicator size="small" color={t.primary} />
        ) : comments.length === 0 ? (
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
            No comments yet. Be the first to reply.
          </Text>
        ) : (
          <>
            {top.map((tc) => {
              const thread = threads.get(tc.id) ?? []
              const tcHidden = isMutedAuthor(mutedSet, tc.author_id) && !revealed.has(tc.id)
              return (
                <View key={tc.id} style={{ gap: 12 }}>
                  {tcHidden ? (
                    <MutedPlaceholder
                      name={memberById.get(tc.author_id)?.display_name ?? 'Member'}
                      onToggle={() => reveal(tc.id)}
                    />
                  ) : (
                    <CommentItem
                      comment={tc}
                      clusterId={clusterId}
                      author={memberById.get(tc.author_id)}
                      onReply={() => setReplyTo({ id: tc.id, authorName: authorNameOf(tc.id) })}
                      onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                      likeCount={likesByComment.get(tc.id)?.count ?? 0}
                      likedByMe={likesByComment.get(tc.id)?.mine ?? false}
                      replyCount={thread.length}
                    />
                  )}
                  {thread.length > 0 ? (
                    <View style={{ marginLeft: 44, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: t.outlineVariant, gap: 12 }}>
                      {thread.map((r) =>
                        isMutedAuthor(mutedSet, r.author_id) && !revealed.has(r.id) ? (
                          <MutedPlaceholder
                            key={r.id}
                            name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                            onToggle={() => reveal(r.id)}
                          />
                        ) : (
                          <CommentItem
                            key={r.id}
                            comment={r}
                            clusterId={clusterId}
                            author={memberById.get(r.author_id)}
                            repliedToName={r.parent_comment_id === tc.id ? undefined : authorNameOf(r.parent_comment_id as string)}
                            onReply={() => setReplyTo({ id: r.id, authorName: authorNameOf(r.id) })}
                            onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                            likeCount={likesByComment.get(r.id)?.count ?? 0}
                            likedByMe={likesByComment.get(r.id)?.mine ?? false}
                          />
                        ),
                      )}
                    </View>
                  ) : null}
                </View>
              )
            })}
            {orphans.map((c) =>
              isMutedAuthor(mutedSet, c.author_id) && !revealed.has(c.id) ? (
                <MutedPlaceholder
                  key={c.id}
                  name={memberById.get(c.author_id)?.display_name ?? 'Member'}
                  onToggle={() => reveal(c.id)}
                />
              ) : (
                <CommentItem
                  key={c.id}
                  comment={c}
                  clusterId={clusterId}
                  author={memberById.get(c.author_id)}
                  repliedToName={c.parent_comment_id ? authorNameOf(c.parent_comment_id) : undefined}
                  onReply={() => setReplyTo({ id: c.id, authorName: authorNameOf(c.id) })}
                  onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                  likeCount={likesByComment.get(c.id)?.count ?? 0}
                  likedByMe={likesByComment.get(c.id)?.mine ?? false}
                />
              ),
            )}
          </>
        )}
      </View>
    </View>
  )
}
