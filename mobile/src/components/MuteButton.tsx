import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Volume2, VolumeX } from 'lucide-react-native'
import { useAuth } from '../auth-context'
import { useIsMuted, useMuteUser, useUnmuteUser } from '../features/moderation'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { Modal } from './Modal'
import { PrimaryButton } from './ui'

export function MuteButton({ targetUserId, targetName, fill }: { targetUserId: string; targetName: string; fill?: boolean }) {
  const t = useTheme()
  const auth = useAuth()
  const selfId = auth.state === 'signedIn' ? auth.userId : null
  const muted = useIsMuted(targetUserId)
  const mute = useMuteUser()
  const unmute = useUnmuteUser()
  const pending = mute.isPending || unmute.isPending
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmKind, setConfirmKind] = useState<'mute' | 'unmute' | null>(null)

  if (selfId !== null && targetUserId === selfId) return null

  const label = muted ? 'Unmute' : 'Mute'
  const Icon = muted ? Volume2 : VolumeX
  const error = mute.error ?? unmute.error
  const dialogUnmute = (confirmKind ?? (muted ? 'unmute' : 'mute')) === 'unmute'
  const dialogTitle = dialogUnmute ? `Unmute ${targetName}?` : `Mute ${targetName}?`
  const dialogLabel = dialogUnmute ? 'Unmute' : 'Mute'
  const DialogIcon = dialogUnmute ? Volume2 : VolumeX

  function openConfirm() {
    setConfirmError(null)
    setConfirmKind(muted ? 'unmute' : 'mute')
    setConfirmOpen(true)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmError(null)
    setConfirmKind(null)
  }

  async function handleConfirm() {
    setConfirmError(null)
    try {
      if (dialogUnmute) {
        await unmute.mutateAsync({ targetUserId })
      } else {
        await mute.mutateAsync({ targetUserId, displayName: targetName })
      }
      closeConfirm()
    } catch {
      setConfirmError('Couldn’t update. Try again.')
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: fill ? 1 : 0 }}>
      <Pressable
        disabled={pending}
        onPress={() => openConfirm()}
        accessibilityLabel={`${label} ${targetName}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: pending }}
        style={{
          flex: fill ? 1 : 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderWidth: 1,
          borderColor: t.outlineVariant,
          borderRadius: radii.pill,
          paddingHorizontal: 12,
          paddingVertical: 8,
          minHeight: 44,
          opacity: pending ? 0.6 : 1,
        }}
      >
        <Icon size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.onSurfaceVariant }}>{label}</Text>
      </Pressable>
      {error ? (
        <Text style={{ fontSize: 12, color: t.error }}>Couldn’t update. Try again.</Text>
      ) : null}
      <Modal open={confirmOpen} onClose={() => { if (!pending) closeConfirm() }} title={dialogTitle}>
        {dialogUnmute ? (
          <Text style={{ marginTop: 12, fontSize: 14, color: t.onSurfaceVariant }}>
            Unmuting {targetName} shows their messages, posts, comments, and signals again right away.
          </Text>
        ) : (
          <Text style={{ marginTop: 12, fontSize: 14, color: t.onSurfaceVariant }}>
            Muting {targetName} hides their messages, posts, comments, and signals for you only, in every shared
            cluster. Membership, votes, and presence stay the same. They are never told. You can unmute anytime.
          </Text>
        )}
        {confirmError ? (
          <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{confirmError}</Text>
        ) : null}
        <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={() => closeConfirm()}
            disabled={pending}
            hitSlop={8}
            style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: 'center', opacity: pending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
          <PrimaryButton
            title={dialogLabel}
            loadingTitle="Saving…"
            loading={pending}
            onPress={handleConfirm}
            icon={<DialogIcon size={16} color={t.onPrimary} strokeWidth={1.5} />}
          />
        </View>
      </Modal>
    </View>
  )
}
