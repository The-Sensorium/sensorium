import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useChat } from '@livekit/react-native'
import { Send } from 'lucide-react-native'
import { radii } from '../../../lib/theme-tokens'
import { useTheme } from '../../../lib/use-theme'

type InCallMessage = ReturnType<typeof useChat>['chatMessages'][number]

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function isSameSender(a: InCallMessage, b: InCallMessage): boolean {
  return Boolean(a.from && b.from && a.from.identity === b.from.identity)
}

function ChatRow({ item, showName }: { item: InCallMessage; showName: boolean }) {
  const t = useTheme()
  const mine = item.from?.isLocal === true
  const sender = item.from?.name || 'Member'

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginTop: showName ? 12 : 2 }}>
      {showName ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4, paddingHorizontal: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
            {sender}
          </Text>
          <Text style={{ fontSize: 11, color: t.onSurfaceVariant, opacity: 0.7 }}>
            {timeFormatter.format(new Date(item.timestamp))}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          maxWidth: '80%',
          backgroundColor: mine ? t.primary : t.surfaceContainer,
          borderRadius: radii.lg,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontSize: 14, color: mine ? '#fff' : t.onSurface }}>{item.message}</Text>
      </View>
    </View>
  )
}

/**
 * In-call chat over LiveKit's data channel, so it works with the web call's
 * Messages panel too. Ephemeral by design: history lives only for the session.
 */
export function InCallChat({
  open,
  onUnreadChange,
}: {
  open: boolean
  onUnreadChange?: (count: number) => void
}) {
  const t = useTheme()
  const { chatMessages, send, isSending } = useChat()
  const [draft, setDraft] = useState('')
  const listRef = useRef<FlatList<InCallMessage> | null>(null)
  const [readCount, setReadCount] = useState(0)

  // Unread = messages that arrived while the sheet was closed; opening marks
  // everything read. Mirrors the count LiveKit shows on the web chat toggle.
  useEffect(() => {
    if (open) setReadCount(chatMessages.length)
  }, [open, chatMessages.length])

  const unread = open ? 0 : Math.max(0, chatMessages.length - readCount)
  useEffect(() => {
    onUnreadChange?.(unread)
  }, [unread, onUnreadChange])

  async function handleSend() {
    const text = draft.trim()
    if (!text || isSending) return
    setDraft('')
    await send(text).catch(() => setDraft(text))
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={chatMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const prev = index > 0 ? chatMessages[index - 1] : undefined
          return <ChatRow item={item} showName={!prev || !isSameSender(prev, item)} />
        }}
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 8, paddingHorizontal: 2 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontSize: 13, color: t.onSurfaceVariant, textAlign: 'center' }}>
              No messages yet. Messages show only during the call.
            </Text>
          </View>
        }
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8 }}>
        <TextInput
          accessibilityLabel="Chat message"
          value={draft}
          onChangeText={setDraft}
          placeholder="Message the call…"
          placeholderTextColor={t.onSurfaceVariant}
          maxLength={1000}
          multiline
          style={{
            flex: 1,
            backgroundColor: t.surfaceLowest,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.md,
            paddingHorizontal: 16,
            paddingVertical: 10,
            fontSize: 14,
            lineHeight: 20,
            maxHeight: 120,
            color: t.onSurface,
          }}
        />
        <Pressable
          accessibilityLabel="Send chat message"
          disabled={!draft.trim() || isSending}
          onPress={() => void handleSend()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.surfaceContainer,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !draft.trim() || isSending ? 0.6 : 1,
          }}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={t.primary} />
          ) : (
            <Send
              size={20}
              color={draft.trim() ? t.primary : t.onSurfaceVariant}
              strokeWidth={1.5}
            />
          )}
        </Pressable>
      </View>
    </View>
  )
}
