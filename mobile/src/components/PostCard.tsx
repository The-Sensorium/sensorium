import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { Link } from 'expo-router'
import { Heart, MessageSquare, MoreVertical } from 'lucide-react-native'
import { useAuth } from '../auth-context'
import { Avatar } from './Avatar'
import { PostActionsSheet } from './PostActionsSheet'
import { PostMedia } from './PostMedia'
import { Modal } from './Modal'
import { ReportModal } from './ReportModal'
import { useDeletePost, useEditPost, type Post } from '../features/posts'
import { toErrorMessage } from '../lib/error'
import { dateTimeFormatter } from './room/format'
import { radii, shadowSoft } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { PrimaryButton } from './ui'

export function PostCard({
  post,
  clusterId,
  author,
  likeCount,
  likedByMe,
  commentCount,
  onLike,
  onDeleted,
  clusterName,
  compact,
}: {
  post: Post
  clusterId: string
  author: { id: string; display_name: string; avatar_url: string | null } | undefined
  likeCount: number
  likedByMe: boolean
  commentCount: number
  onLike: (postId: string) => void
  onDeleted?: () => void
  clusterName?: string
  compact?: boolean
}) {
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const isMine = post.author_id === userId

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.content ?? '')
  const [titleDraft, setTitleDraft] = useState(post.title ?? '')
  const [editError, setEditError] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const edit = useEditPost(clusterId)
  const del = useDeletePost(clusterId)

  async function handleDelete() {
    setDeleteError(null)
    try {
      await del.mutateAsync(post.id)
      setConfirmOpen(false)
      onDeleted?.()
    } catch (e) {
      setDeleteError(toErrorMessage(e, 'Could not delete your post. Try again.'))
    }
  }

  async function handleEdit() {
    const content = draft.trim()
    if (!content || edit.isPending) return
    setEditError(null)
    try {
      await edit.mutateAsync({ postId: post.id, content, title: titleDraft.trim() || null })
      setEditing(false)
    } catch (e) {
      setEditError(toErrorMessage(e, 'Could not edit your post. Try again.'))
    }
  }

  return (
    <View
      style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: compact ? 16 : 20, marginBottom: 16, ...shadowSoft }}
    >
      <Link href={{ pathname: '/posts/[postId]', params: { postId: post.id } }} asChild>
        <Pressable
          onLongPress={() => setMenuOpen(true)}
          delayLongPress={350}
        >
          {compact ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={author?.display_name ?? 'Member'} src={author?.avatar_url} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                  <Text style={{ fontWeight: '500' }}>{author?.display_name ?? 'Member'}</Text>
                  {isMine ? <Text style={{ color: t.onSurfaceVariant }}> (you)</Text> : null}
                  <Text style={{ color: t.onSurfaceVariant }}> · {dateTimeFormatter.format(new Date(post.created_at))}</Text>
                  {post.edited_at ? <Text style={{ color: t.onSurfaceVariant }}> · edited</Text> : null}
                </Text>
                {clusterName ? (
                  <Text style={{ marginTop: 2, fontSize: 12, fontWeight: '600', color: t.primary }} numberOfLines={1}>
                    {clusterName}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Avatar name={author?.display_name ?? 'Member'} src={author?.avatar_url} size={20} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: t.onSurface }}>
                {author?.display_name ?? 'Member'}
              </Text>
              {isMine ? <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>(you)</Text> : null}
              <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                · {dateTimeFormatter.format(new Date(post.created_at))}
              </Text>
              {clusterName ? (
                <Text style={{ fontSize: 12, fontWeight: '600', color: t.primary }}>· {clusterName}</Text>
              ) : null}
              {post.edited_at ? (
                <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>· edited</Text>
              ) : null}
            </View>
          )}
          {post.title ? (
            <Text
              style={{ marginTop: 8, fontSize: 16, fontWeight: '600', lineHeight: 22, color: t.onSurface }}
              numberOfLines={compact ? 2 : undefined}
            >
              {post.title}
            </Text>
          ) : null}
          {post.content ? (
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurface }} numberOfLines={compact ? 2 : undefined}>
              {post.content}
            </Text>
          ) : null}
          <PostMedia imageUrl={post.image_url} gifUrl={post.gif_url} alt={post.content ?? 'Post media'} compact={compact} />
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable
              accessibilityLabel="Like post"
              onPress={() => onLike(post.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Heart
                size={22}
                color={likedByMe ? t.error : t.onSurfaceVariant}
                strokeWidth={2}
                fill={likedByMe ? t.error : 'transparent'}
              />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>{likeCount}</Text>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={22} color={t.onSurfaceVariant} strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>{commentCount}</Text>
            </View>

            <View style={{ marginLeft: 'auto' }}>
              <Pressable
                accessibilityLabel="Post actions"
                onPress={() => setMenuOpen(true)}
                hitSlop={6}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
              >
                <MoreVertical size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Link>

      <PostActionsSheet
        open={menuOpen}
        mine={isMine}
        onClose={() => setMenuOpen(false)}
        onEdit={() => {
          setMenuOpen(false)
          setEditing(true)
        }}
        onDelete={() => {
          setMenuOpen(false)
          setConfirmOpen(true)
        }}
        onReport={() => {
          setMenuOpen(false)
          setReportOpen(true)
        }}
      />

      <Modal open={confirmOpen} onClose={() => { if (!del.isPending) setConfirmOpen(false) }} title="Delete post?">
        <Text style={{ marginTop: 12, fontSize: 14, color: t.onSurfaceVariant }}>
          This removes your post from the cluster. This action can&apos;t be undone.
        </Text>
        {deleteError ? (
          <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{deleteError}</Text>
        ) : null}
        <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <Pressable
            onPress={() => setConfirmOpen(false)}
            disabled={del.isPending}
            style={{ paddingHorizontal: 16, paddingVertical: 10, opacity: del.isPending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
          <PrimaryButton
            title="Delete"
            loadingTitle="Deleting…"
            loading={del.isPending}
            onPress={() => void handleDelete()}
          />
        </View>
      </Modal>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit post">
        <View style={{ marginTop: 12, gap: 12 }}>
          <TextInput
            value={titleDraft}
            onChangeText={setTitleDraft}
            maxLength={200}
            placeholder="Post title (optional)"
            placeholderTextColor={t.onSurfaceVariant}
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
            maxLength={2000}
            multiline
            numberOfLines={4}
            autoFocus
            style={{
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.md,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 14,
              lineHeight: 22,
              minHeight: 104,
              textAlignVertical: 'top',
              color: t.onSurface,
            }}
          />
          {editError ? <Text style={{ fontSize: 12, color: t.error }}>{editError}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Pressable onPress={() => setEditing(false)} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>Cancel</Text>
            </Pressable>
            <PrimaryButton
              title="Save"
              loading={edit.isPending}
              onPress={() => void handleEdit()}
            />
          </View>
        </View>
      </Modal>

      {author ? (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          clusterId={clusterId}
          target={{ id: author.id, name: author.display_name }}
          contentTarget={{ kind: 'post', id: post.id }}
        />
      ) : null}
    </View>
  )
}
