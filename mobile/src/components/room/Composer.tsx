import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Check, CornerUpLeft, ImagePlus, Megaphone, Pencil, Phone, Plus, Send, Users, X } from 'lucide-react-native'
import { Avatar } from '../Avatar'
import { CollapsibleChrome } from '../CollapsibleChrome'
import {
  EVERYONE_NAME,
  filterMentionCandidates,
  matchesEveryone,
  parseMentionQuery,
  type MentionMember,
} from '../../features/mentions'
import { type Gif } from '../../features/gifs'
import { toErrorMessage } from '../../lib/error'
import { errorHaptic, lightHaptic } from '../../lib/haptics'
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

type MentionOption = { key: string; kind: 'everyone' } | { key: string; kind: 'member'; member: MentionMember }

export function Composer({
  members,
  selfId,
  pending,
  raisePending,
  error,
  replyTo,
  editing,
  editPending,
  onError,
  onTyping,
  onStopTyping,
  onSend,
  onSaveEdit,
  onSendImage,
  onSendGif,
  onOpenSignal,
  onStartCall,
  callActive,
  onCancelReply,
  onCancelEdit,
}: {
  members: MentionMember[]
  selfId: string | null
  pending: boolean
  raisePending: boolean
  error: string | null
  replyTo: { id: string; authorName: string; preview: string } | null
  editing: { id: string; content: string } | null
  editPending: boolean
  onError(message: string | null): void
  onTyping(): void
  onStopTyping(): void
  onSend(content: string): Promise<void>
  onSaveEdit(content: string): void
  onSendImage(image: PickedImage, caption: string | null): Promise<void>
  onSendGif(gif: Gif): Promise<void>
  onOpenSignal(): void
  onStartCall(): void
  callActive: boolean
  onCancelReply(): void
  onCancelEdit(): void
}) {
  const t = useTheme()
  const [draft, setDraft] = useState('')
  const [editText, setEditText] = useState('')
  const [gifOpen, setGifOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null)
  const [caret, setCaret] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [stagedImage, setStagedImage] = useState<PickedImage | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<TextInput>(null)
  const focusedEditId = useRef<string | null>(null)

  // Edit mode borrows the composer: the draft stays untouched in state while
  // the original text loads here, where the keyboard can never cover it.
  // Initialized during render on open, close, or message switch only, so
  // realtime updates never clobber in-progress edits.
  const [prevEditingId, setPrevEditingId] = useState<string | null>(null)
  const editingIdNow = editing?.id ?? null
  if (editingIdNow !== prevEditingId) {
    setPrevEditingId(editingIdNow)
    setEditText(editing?.content ?? '')
  }
  useEffect(() => {
    if (editing && focusedEditId.current !== editing.id) {
      focusedEditId.current = editing.id
      inputRef.current?.focus()
    }
    if (!editing) focusedEditId.current = null
  })

  const mentionMembers = useMemo(() => {
    if (!selfId) return []
    return members.filter((m) => m.id !== selfId)
  }, [members, selfId])

  const showEveryone = mention !== null && matchesEveryone(mention.query)
  const mentionCandidates = useMemo(() => {
    if (!mention || mentionMembers.length === 0) return []
    return filterMentionCandidates(mention.query, mentionMembers, selfId ?? '').slice(
      0,
      showEveryone ? 7 : 8,
    )
  }, [mention, mentionMembers, selfId, showEveryone])
  const mentionOpen = mention !== null && (showEveryone || mentionCandidates.length > 0)
  const mentionOptions = useMemo<MentionOption[]>(
    () => [
      ...(showEveryone ? [{ key: 'everyone', kind: 'everyone' as const }] : []),
      ...mentionCandidates.map((member) => ({ key: member.id, kind: 'member' as const, member })),
    ],
    [showEveryone, mentionCandidates],
  )

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current)
    }
  }, [])

  function handleInputChange(value: string) {
    setDraft(value)
    // The + and GIF toggles hide while typing, so an open menu or picker
    // must not linger above the composer without its trigger visible.
    if (value.trim().length > 0) {
      setMenuOpen(false)
      setGifOpen(false)
    }
    setMention(parseMentionQuery(value, caret))
    onTyping()
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => onStopTyping(), 2000)
  }

  function insertToken(name: string) {
    if (!mention) return
    const tag = `@${name} `
    if (editing) {
      setEditText(`${editText.slice(0, mention.start)}${tag}${editText.slice(mention.end)}`)
    } else {
      setDraft(`${draft.slice(0, mention.start)}${tag}${draft.slice(mention.end)}`)
    }
    setMention(null)
  }

  function insertMention(member: MentionMember) {
    insertToken(member.display_name)
  }

  function insertEveryone() {
    insertToken(EVERYONE_NAME)
  }

  function handleEditChange(value: string) {
    setEditText(value)
    setMention(parseMentionQuery(value, caret))
  }

  function handleSaveEdit() {
    if (!editing || editPending) return
    const content = editText.trim()
    if (!content) return
    onError(null)
    onSaveEdit(content)
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
      lightHaptic()
    } catch (e) {
      errorHaptic()
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
      lightHaptic()
    } catch (e) {
      errorHaptic()
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
  const canSave = editText.trim().length > 0 && !editPending
  // Mirror the comment composer: while typing, the actions button collapses
  // so the input gets the full width. Send stays visible throughout.
  const isTyping = draft.trim().length > 0

  return (
    <View>
      {error ? (
        <Text style={{ fontSize: 14, color: t.error, marginBottom: 8 }}>{error}</Text>
      ) : null}
      {editing ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: t.surface,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 8,
          }}
        >
          <Pencil size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurface }}>
              Editing message
            </Text>
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
              {editing.content.trim() ? editing.content : 'Message'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Cancel edit"
            onPress={onCancelEdit}
            hitSlop={12}
            style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
      ) : replyTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: t.surface,
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
            hitSlop={12}
            style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
      ) : null}
      {editing ? null : stagedImage ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: t.surface,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 8,
          }}
        >
          <Image source={{ uri: stagedImage.uri }} style={{ width: 48, height: 48, borderRadius: radii.md }} />
          <Text style={{ flex: 1, fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
            Image attached. Add a caption or press send
          </Text>
          <Pressable
            accessibilityLabel="Remove image"
            onPress={() => {
              if (!uploading) setStagedImage(null)
            }}
            hitSlop={12}
            style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.4 : 1 }}
          >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
      ) : null}
      {editing ? null : gifOpen ? (
        <View style={{ marginBottom: 8 }}>
          <GifPicker pending={pending} onSelect={(gif) => void handleSendGif(gif)} />
        </View>
      ) : null}
      {menuOpen ? (
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: t.surface,
            borderRadius: radii.xl,
            padding: 4,
            marginBottom: 8,
          }}
        >
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
          {!callActive ? (
            <MenuRow
              label="Start a call"
              disabled={raisePending}
              onPress={() => {
                setMenuOpen(false)
                onStartCall()
              }}
            >
              <Phone size={16} color={t.onSurface} strokeWidth={1.5} />
            </MenuRow>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {mentionOpen ? (
          <View
            accessibilityLabel={`Mention suggestions, ${mentionOptions.length} available`}
            style={{
              position: 'absolute',
              bottom: '100%',
              start: 0,
              minWidth: 176,
              maxWidth: '85%',
              marginBottom: 8,
              maxHeight: 216,
              backgroundColor: t.surface,
              borderRadius: radii.xl,
            }}
          >
            <FlatList
              data={mentionOptions}
              keyExtractor={(option) => option.key}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 4 }}
              renderItem={({ item: option }) =>
                option.kind === 'everyone' ? (
                  <Pressable
                    onPress={() => insertEveryone()}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Mention everyone"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 12, minHeight: 48 }}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}>
                      <Users size={16} color={t.primary} strokeWidth={1.5} />
                    </View>
                    <Text style={{ fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                      everyone
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => insertMention(option.member)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Mention ${option.member.display_name}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 12, minHeight: 48 }}
                  >
                    <Avatar name={option.member.display_name} src={option.member.avatar_url} size={24} />
                    <Text style={{ fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                      {option.member.display_name}
                    </Text>
                  </Pressable>
                )
              }
            />
          </View>
        ) : null}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.md,
            paddingStart: 6,
            paddingEnd: 4,
            paddingVertical: 4,
          }}
        >
          <CollapsibleChrome shown={!isTyping && !editing} width={44} height={44}>
            <Pressable
              accessibilityLabel="Room actions"
              disabled={raisePending}
              onPress={() => {
                setGifOpen(false)
                setMenuOpen((o) => !o)
              }}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: raisePending ? 0.6 : 1,
              }}
            >
      {editing ? null : menuOpen ? (
                <X size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
              ) : (
                <Plus size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
              )}
            </Pressable>
          </CollapsibleChrome>
          <TextInput
            ref={inputRef}
            accessibilityLabel={editing ? 'Edit message' : 'Message'}
            value={editing ? editText : draft}
            onChangeText={editing ? handleEditChange : handleInputChange}
            onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
            onBlur={() => {
              onStopTyping()
              setMention(null)
            }}
            placeholder={editing ? 'Edit message…' : stagedImage ? 'Add a caption…' : 'Write to your cluster…'}
            placeholderTextColor={t.onSurfaceVariant}
            maxLength={2000}
            multiline
            style={{
              flex: 1,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 16,
              lineHeight: 22,
              maxHeight: 120,
              color: t.onSurface,
            }}
          />
          <CollapsibleChrome shown={!isTyping && !editing} width={44} height={44}>
            <Pressable
              accessibilityLabel="Attach image"
              accessibilityRole="button"
              onPress={() => void handlePickImage()}
              hitSlop={8}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <ImagePlus size={22} color={stagedImage ? t.primary : t.onSurfaceVariant} strokeWidth={1.5} />
            </Pressable>
          </CollapsibleChrome>
          <CollapsibleChrome shown={!isTyping && !editing} width={44} height={44}>
            <Pressable
              accessibilityLabel="Add a GIF"
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false)
                setGifOpen((o) => !o)
              }}
              hitSlop={8}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  borderWidth: 1.5,
                  borderColor: gifOpen ? t.primary : t.onSurfaceVariant,
                  borderRadius: 6,
                  paddingHorizontal: 5,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: gifOpen ? t.primary : t.onSurfaceVariant }}>
                  GIF
                </Text>
              </View>
            </Pressable>
          </CollapsibleChrome>
        </View>
        <Pressable
          accessibilityLabel={editing ? 'Save edit' : 'Send message'}
          disabled={editing ? !canSave : !canSend}
          accessibilityState={{ disabled: editing ? !canSave : !canSend }}
          onPress={() => (editing ? handleSaveEdit() : void handleSend())}
          hitSlop={8}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: (editing ? !canSave : !canSend) ? 0.4 : 1,
          }}
        >
          {pending || uploading || editPending ? (
            <ActivityIndicator size="small" color={t.onPrimary} />
          ) : editing ? (
            <Check size={20} color={t.onPrimary} strokeWidth={2} />
          ) : (
            <Send size={20} color={t.onPrimary} strokeWidth={1.5} />
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
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 14,
        minHeight: 48,
        borderRadius: radii.md,
        backgroundColor: pressed ? t.surfaceContainer : 'transparent',
        opacity: disabled ? 0.6 : 1,
      })}
    >
      {children}
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>{label}</Text>
    </Pressable>
  )
}
