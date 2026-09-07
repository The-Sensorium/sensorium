import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { CornerUpLeft, ImagePlay, ImagePlus, Megaphone, Plus, Send, X } from 'lucide-react-native'
import { Avatar } from '../Avatar'
import {
  filterMentionCandidates,
  parseMentionQuery,
  type MentionMember,
} from '../../features/mentions'
import { type Gif } from '../../features/gifs'
import { toErrorMessage } from '../../lib/error'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { GifPicker } from './GifPicker'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export interface PickedImage {
  uri: string
  mime: string
  width: number
  height: number
}

export function Composer({
  members,
  selfId,
  pending,
  raisePending,
  error,
  replyTo,
  onError,
  onTyping,
  onStopTyping,
  onSend,
  onSendImage,
  onSendGif,
  onOpenSignal,
  onCancelReply,
}: {
  members: MentionMember[]
  selfId: string | null
  pending: boolean
  raisePending: boolean
  error: string | null
  replyTo: { id: string; authorName: string; preview: string } | null
  onError(message: string | null): void
  onTyping(): void
  onStopTyping(): void
  onSend(content: string): Promise<void>
  onSendImage(image: PickedImage, caption: string | null): Promise<void>
  onSendGif(gif: Gif): Promise<void>
  onOpenSignal(): void
  onCancelReply(): void
}) {
  const t = useTheme()
  const [draft, setDraft] = useState('')
  const [gifOpen, setGifOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null)
  const [caret, setCaret] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [stagedImage, setStagedImage] = useState<PickedImage | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mentionMembers = useMemo(() => {
    if (!selfId) return []
    return members.filter((m) => m.id !== selfId)
  }, [members, selfId])

  const mentionCandidates = useMemo(() => {
    if (!mention || mentionMembers.length === 0) return []
    return filterMentionCandidates(mention.query, mentionMembers, selfId ?? '')
  }, [mention, mentionMembers, selfId])

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current)
    }
  }, [])

  function handleInputChange(value: string) {
    setDraft(value)
    setMention(parseMentionQuery(value, caret))
    onTyping()
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => onStopTyping(), 2000)
  }

  function insertMention(member: MentionMember) {
    if (!mention) return
    const name = member.display_name
    setDraft(`${draft.slice(0, mention.start)}@${name} ${draft.slice(mention.end)}`)
    setMention(null)
  }

  async function handleSend() {
    if (pending || uploading) return
    const content = draft.trim()
    if (!content && !stagedImage) return
    onError(null)
    onStopTyping()
    try {
      if (stagedImage) {
        setUploading(true)
        await onSendImage(stagedImage, content || null)
        setStagedImage(null)
      } else {
        await onSend(content)
      }
      setDraft('')
      setMention(null)
    } catch (e) {
      onError(toErrorMessage(e, 'Could not send your message. Try again.'))
    } finally {
      setUploading(false)
    }
  }

  async function handleSendGif(gif: Gif) {
    onError(null)
    onStopTyping()
    setGifOpen(false)
    try {
      await onSendGif(gif)
    } catch (e) {
      onError(toErrorMessage(e, 'Could not send that GIF. Try again.'))
    }
  }

  async function handlePickImage() {
    setMenuOpen(false)
    onError(null)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    const mime = asset.mimeType ?? 'image/jpeg'
    if (!ALLOWED_IMAGE_TYPES.has(mime)) {
      onError('Only JPG, PNG, WebP and GIF images are supported.')
      return
    }
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      onError('Images must be 5 MB or smaller.')
      return
    }
    setStagedImage({ uri: asset.uri, mime, width: asset.width ?? 0, height: asset.height ?? 0 })
  }

  const canSend = (draft.trim().length > 0 || stagedImage !== null) && !pending && !uploading

  return (
    <View>
      {error ? (
        <Text style={{ fontSize: 14, color: t.error, marginBottom: 8 }}>{error}</Text>
      ) : null}
      {replyTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: t.surfaceLowest,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 8,
          }}
        >
          <CornerUpLeft size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurface }}>
              Replying to {replyTo.authorName}
            </Text>
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
              {replyTo.preview}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Cancel reply"
            onPress={onCancelReply}
            style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
      ) : null}
      {stagedImage ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: t.surfaceLowest,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 8,
          }}
        >
          <Image source={{ uri: stagedImage.uri }} style={{ width: 48, height: 48, borderRadius: radii.md }} />
          <Text style={{ flex: 1, fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
            Image attached — add a caption or press send
          </Text>
          <Pressable
            accessibilityLabel="Remove image"
            onPress={() => {
              if (!uploading) setStagedImage(null)
            }}
            style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.4 : 1 }}
          >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
      ) : null}
      {gifOpen ? (
        <View style={{ marginBottom: 8 }}>
          <GifPicker pending={pending} onSelect={(gif) => void handleSendGif(gif)} />
        </View>
      ) : null}
      {menuOpen ? (
        <View
          style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 4, marginBottom: 8 }}
        >
          <MenuRow
            label="Send an image"
            disabled={uploading}
            onPress={() => void handlePickImage()}
          >
            <ImagePlus size={16} color={t.onSurface} strokeWidth={1.5} />
          </MenuRow>
          <MenuRow
            label="Send a GIF"
            disabled={uploading}
            onPress={() => {
              setMenuOpen(false)
              setGifOpen(true)
            }}
          >
            <ImagePlay size={16} color={t.onSurface} strokeWidth={1.5} />
          </MenuRow>
          <MenuRow
            label="Raise a signal"
            disabled={raisePending}
            onPress={() => {
              setMenuOpen(false)
              onOpenSignal()
            }}
          >
            <Megaphone size={16} color={t.onSurface} strokeWidth={1.5} />
          </MenuRow>
        </View>
      ) : null}
      {mention && mentionCandidates.length > 0 ? (
        <View style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 4, marginBottom: 8 }}>
          {mentionCandidates.map((candidate) => (
            <Pressable
              key={candidate.id}
              onPress={() => insertMention(candidate)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 }}
            >
              <Avatar name={candidate.display_name} src={candidate.avatar_url} size={24} />
              <Text style={{ fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                {candidate.display_name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <Pressable
          accessibilityLabel="Room actions"
          disabled={raisePending}
          onPress={() => {
            setGifOpen(false)
            setMenuOpen((o) => !o)
          }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: raisePending ? 0.6 : 1,
          }}
        >
          {menuOpen ? (
            <X size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
          ) : (
            <Plus size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
          )}
        </Pressable>
        <TextInput
          accessibilityLabel="Message"
          value={draft}
          onChangeText={handleInputChange}
          onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
          onBlur={() => {
            onStopTyping()
            setMention(null)
          }}
          placeholder={stagedImage ? 'Add a caption…' : 'Write to your cluster…'}
          placeholderTextColor={t.onSurfaceVariant}
          maxLength={2000}
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
          accessibilityLabel="Send message"
          disabled={!canSend}
          onPress={() => void handleSend()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.surfaceContainer,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canSend ? 1 : 0.6,
          }}
        >
          {pending || uploading ? (
            <ActivityIndicator size="small" color={t.primary} />
          ) : (
            <Send size={20} color={canSend ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
          )}
        </Pressable>
      </View>
    </View>
  )
}

function MenuRow({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string
  disabled?: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, opacity: disabled ? 0.6 : 1 }}
    >
      {children}
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>{label}</Text>
    </Pressable>
  )
}
