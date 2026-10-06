import { Pressable, Text, View } from 'react-native'
import { CornerUpLeft, ShieldOff } from 'lucide-react-native'
import { Avatar } from '../Avatar'
import { AvatarLink } from '../AvatarLink'
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
  clusterId,
  reactions,
  myReactionKeys,
  members,
  showDay,
  showAuthor = true,
  replyParent,
  highlighted,
  onPressReplyParent,
  onToggleMenu,
  onToggleReaction,
}: {
  message: Message
  mine: boolean
  author: { id: string; display_name: string; avatar_url: string | null } | undefined
  clusterId: string
  reactions: Reaction[]
  myReactionKeys: ReadonlySet<string>
  members: MentionMember[]
  showDay: boolean
  showAuthor?: boolean
  replyParent: { authorName?: string; preview: string } | undefined
  highlighted?: boolean
  onPressReplyParent?(parentId: string): void
  onToggleMenu(): void
  onToggleReaction(messageId: string, emoji: string): void
}) {
  const t = useTheme()
  const grouped = new Map<string, number>()
  for (const r of reactions) grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1)
  const gifUrl = message.content?.startsWith('gif:') ? message.content.slice(4) : null
  const hasMedia = Boolean(message.image_url) || Boolean(gifUrl)
  const toneMine = mine && !hasMedia
  // The quote jumps to the original message, but only when there is a real,
  // visible parent to land on (deleted, muted-hidden, and unfetched parents
  // render fallback text and stay inert).
  const replyParentId = message.reply_to_id ?? null
  const jumpable = Boolean(replyParentId && replyParent && onPressReplyParent)

  const avatarSlot = (
    <View style={{ width: 28, flexShrink: 0 }}>
      {showAuthor ? (
        author ? (
          <AvatarLink
            userId={author.id}
            clusterId={clusterId}
            name={author.display_name}
            src={author.avatar_url}
            size={28}
          />
        ) : (
          <Avatar name="Member" src={null} size={28} />
        )
      ) : (
        <View style={{ width: 28, height: 28 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      )}
    </View>
  )
  return (
    <View>
      {showDay ? <DayDivider iso={message.created_at} /> : null}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: mine ? 'flex-end' : 'flex-start',
          alignItems: 'flex-start',
          gap: 8,
          paddingTop: showAuthor ? 12 : 2,
          paddingBottom: 2,
        }}
      >
        {!mine && avatarSlot}
        <View
          style={{
            minWidth: 0,
            maxWidth: '72%',
            flexShrink: 1,
            alignItems: mine ? 'flex-end' : 'flex-start',
          }}
        >
          {showAuthor ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
                {mine ? 'You' : (author?.display_name ?? 'Member')}
              </Text>
              <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                {timeFormatter.format(new Date(message.created_at))}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 8,
            }}
          >
          <Pressable
            accessibilityLabel="Message options"
            accessibilityHint="Shows actions like react, reply, edit, and delete"
            accessibilityActions={[{ name: 'longpress', label: 'Show message actions' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'longpress') onToggleMenu()
            }}
            onLongPress={onToggleMenu}
            delayLongPress={350}
            style={{
              backgroundColor: toneMine ? t.chatOutgoing : t.surfaceContainer,
              borderRadius: 16,
              borderBottomRightRadius: mine ? 4 : 16,
              borderBottomLeftRadius: mine ? 16 : 4,
              paddingHorizontal: 16,
              paddingVertical: 10,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {highlighted ? (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: 'absolute',
                  top: -2,
                  start: -2,
                  end: -2,
                  bottom: -2,
                  borderWidth: 2,
                  borderColor: toneMine ? t.onSurface : t.primary,
                  borderRadius: 18,
                }}
              />
            ) : null}
            {message.reply_to_id ? (
              <Pressable
                accessibilityRole={jumpable ? 'button' : undefined}
                accessibilityLabel={jumpable ? 'Go to replied message' : undefined}
                onPress={jumpable ? () => onPressReplyParent!(replyParentId!) : undefined}
                style={{
                  marginBottom: 6,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 6,
                  backgroundColor: toneMine ? 'rgba(0,0,0,0.15)' : t.surface,
                  borderRadius: radii.md,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <CornerUpLeft size={14} color={toneMine ? t.onPrimary : t.onSurfaceVariant} strokeWidth={1.5} />
                <View style={{ flexShrink: 1, flexGrow: 0 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: toneMine ? t.onPrimary : t.onSurfaceVariant }}>
                    {replyParent?.authorName ?? 'Member'}
                  </Text>
                  <Text style={{ fontSize: 12, color: toneMine ? t.onPrimary : t.onSurfaceVariant, opacity: toneMine ? 0.8 : 1 }} numberOfLines={2}>
                    {replyParent?.preview ?? 'message'}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {message.image_url ? (
              <>
                {message.moderation_status === 'approved' ? (
                  <MessageImage
                    path={message.image_url}
                    alt="Shared image"
                    onLongPress={onToggleMenu}
                  />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
                    <ShieldOff size={16} color={toneMine ? t.onPrimary : t.onSurfaceVariant} strokeWidth={1.5} />
                    <Text style={{ fontSize: 12, color: toneMine ? t.onPrimary : t.onSurfaceVariant }}>
                      This image was hidden by moderation.
                    </Text>
                  </View>
                )}
                {message.content?.trim() ? (
                  <View style={{ marginTop: 6 }}>
                    <MentionText content={message.content} members={members} mine={toneMine} />
                  </View>
                ) : null}
              </>
            ) : gifUrl ? (
              <MessageGif src={gifUrl} onLongPress={onToggleMenu} />
            ) : (
              <MentionText content={message.content ?? ''} members={members} mine={mine} />
            )}
            {message.edited_at ? (
              <Text style={{ fontSize: 12, color: toneMine ? t.onPrimary : t.onSurfaceVariant }}> (edited)</Text>
            ) : null}
          </Pressable>
          </View>

          {grouped.size > 0 ? (
            <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              {[...grouped.entries()].map(([emoji, count]) => {
                const active = myReactionKeys.has(`${message.id}:${emoji}`)
                return (
                  <Pressable
                    key={emoji}
                    accessibilityLabel={`React ${emoji}`}
                    hitSlop={8}
                    onPress={() => onToggleReaction(message.id, emoji)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      borderWidth: 1,
                      borderColor: active ? t.primary : t.outlineVariant,
                      backgroundColor: active ? t.surfaceContainer : t.surfaceLowest,
                      borderRadius: radii.pill,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      minHeight: 32,
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
        {mine && avatarSlot}
      </View>
    </View>
  )
}
