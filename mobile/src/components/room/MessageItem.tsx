import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { CornerUpLeft, Send, ShieldOff, X } from 'lucide-react-native'
import { Avatar } from '../Avatar'
import { MessageActionsSheet } from './MessageActionsSheet'
import { DayDivider } from './DayDivider'
import { MessageGif, MessageImage } from './MessageMedia'
import { MentionText } from './MentionText'
import type { Message, Reaction } from '../../features/cluster'
import type { MentionMember } from '../../features/mentions'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function MessageItem({
  message,
  mine,
  author,
  reactions,
  myReactionKeys,
  members,
  showDay,
  isEditing,
  editDraft,
  editPending,
  menuOpen,
  replyParent,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onToggleMenu,
  onShowInfo,
  onEdit,
  onDelete,
  onReply,
  onToggleReaction,
  onReport,
}: {
  message: Message
  mine: boolean
  author: { id: string; display_name: string; avatar_url: string | null } | undefined
  reactions: Reaction[]
  myReactionKeys: ReadonlySet<string>
  members: MentionMember[]
  showDay: boolean
  isEditing: boolean
  editDraft: string
  editPending: boolean
  menuOpen: boolean
  replyParent: { authorName?: string; preview: string } | undefined
  onEditDraftChange(value: string): void
  onSaveEdit(): void
  onCancelEdit(): void
  onToggleMenu(): void
  onShowInfo(message: Message): void
  onEdit(message: Message): void
  onDelete(messageId: string): void
  onReply(message: Message): void
  onToggleReaction(messageId: string, emoji: string): void
  onReport(message: Message): void
}) {
  const t = useTheme()
  const grouped = new Map<string, number>()
  for (const r of reactions) grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1)
  const gifUrl = message.content?.startsWith('gif:') ? message.content.slice(4) : null

  return (
    <View>
      {showDay ? <DayDivider iso={message.created_at} /> : null}
      <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 }}>
        <View style={{ marginTop: 24 }}>
          <Avatar name={author?.display_name ?? 'Member'} src={author?.avatar_url} size={28} />
        </View>
        <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
              {mine ? 'You' : (author?.display_name ?? 'Member')}
            </Text>
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
              {timeFormatter.format(new Date(message.created_at))}
            </Text>
            <Pressable
              accessibilityLabel="Message actions"
              onPress={onToggleMenu}
              hitSlop={12}
              style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: t.onSurfaceVariant }}>⋯</Text>
            </Pressable>
          </View>

          <MessageActionsSheet
            open={menuOpen}
            mine={mine}
            myReactionKeys={myReactionKeys}
            messageId={message.id}
            onClose={onToggleMenu}
            onToggleReaction={onToggleReaction}
            onReply={() => onReply(message)}
            onInfo={() => onShowInfo(message)}
            onEdit={() => onEdit(message)}
            onDelete={() => onDelete(message.id)}
            onReport={() => onReport(message)}
          />

          <Pressable
            accessibilityLabel={isEditing ? undefined : 'Message options'}
            onLongPress={isEditing ? undefined : onToggleMenu}
            delayLongPress={350}
            style={{
              backgroundColor: isEditing ? t.surfaceLowest : t.surfaceContainer,
              borderRadius: 16,
              borderBottomRightRadius: mine ? 4 : 16,
              borderBottomLeftRadius: mine ? 16 : 4,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            {!isEditing && message.reply_to_id ? (
              <View
                style={{
                  marginBottom: 6,
                  flexDirection: 'row',
                  gap: 6,
                  backgroundColor: t.surface,
                  borderRadius: radii.md,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <CornerUpLeft size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
                    {replyParent?.authorName ?? 'Member'}
                  </Text>
                  <Text style={{ fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={2}>
                    {replyParent?.preview ?? 'message'}
                  </Text>
                </View>
              </View>
            ) : null}
            {isEditing ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, minWidth: 240 }}>
                <TextInput
                  accessibilityLabel="Edit message"
                  value={editDraft}
                  onChangeText={onEditDraftChange}
                  multiline
                  numberOfLines={3}
                  autoFocus
                  style={{
                    flex: 1,
                    minHeight: 72,
                    textAlignVertical: 'top',
                    backgroundColor: t.surface,
                    borderWidth: 1,
                    borderColor: t.outlineVariant,
                    borderRadius: radii.md,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: 14,
                    color: t.onSurface,
                  }}
                />
                <Pressable
                  accessibilityLabel="Save edit"
                  disabled={!editDraft.trim() || editPending}
                  onPress={onSaveEdit}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', opacity: !editDraft.trim() || editPending ? 0.4 : 1 }}
                >
                  {editPending ? (
                    <ActivityIndicator size="small" color={t.primary} />
                  ) : (
                    <Send size={16} color={t.primary} strokeWidth={1.5} />
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel="Cancel edit"
                  onPress={onCancelEdit}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={16} color={t.onSurface} strokeWidth={1.5} />
                </Pressable>
              </View>
            ) : message.image_url ? (
              <>
                {message.moderation_status === 'approved' ? (
                  <MessageImage
                    path={message.image_url}
                    alt="Shared image"
                    onLongPress={isEditing ? undefined : onToggleMenu}
                  />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
                    <ShieldOff size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
                    <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                      This image was hidden by moderation.
                    </Text>
                  </View>
                )}
                {message.content?.trim() ? (
                  <View style={{ marginTop: 6 }}>
                    <MentionText content={message.content} members={members} />
                  </View>
                ) : null}
              </>
            ) : gifUrl ? (
              <MessageGif src={gifUrl} onLongPress={isEditing ? undefined : onToggleMenu} />
            ) : (
              <MentionText content={message.content ?? ''} members={members} />
            )}
            {!isEditing && message.edited_at ? (
              <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}> (edited)</Text>
            ) : null}
          </Pressable>

          {grouped.size > 0 ? (
            <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              {[...grouped.entries()].map(([emoji, count]) => {
                const active = myReactionKeys.has(`${message.id}:${emoji}`)
                return (
                  <Pressable
                    key={emoji}
                    accessibilityLabel={`React ${emoji}`}
                    hitSlop={6}
                    onPress={() => onToggleReaction(message.id, emoji)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      borderWidth: 1,
                      borderColor: active ? t.primary : t.outlineVariant,
                      backgroundColor: active ? t.surfaceContainer : t.surfaceLowest,
                      borderRadius: radii.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 12 }}>{emoji}</Text>
                    <Text style={{ fontSize: 12, color: t.onSurface }}>{count}</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}
