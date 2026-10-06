import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Bell, BellOff } from 'lucide-react-native'
import { useAuth } from '../auth-context'
import { useIsMuted, useMuteUser, useUnmuteUser } from '../features/moderation'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { ConfirmSheet } from './ConfirmSheet'

export function MuteButton({ targetUserId, targetName, fill, menuItem, onDialogClose }: { targetUserId: string; targetName: string; fill?: boolean; menuItem?: boolean; onDialogClose?: () => void }) {
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
  const Icon = muted ? Bell : BellOff
  const error = mute.error ?? unmute.error
  const dialogUnmute = (confirmKind ?? (muted ? 'unmute' : 'mute')) === 'unmute'
  const dialogTitle = dialogUnmute ? `Unmute ${targetName}?` : `Mute ${targetName}?`
  const dialogLabel = dialogUnmute ? 'Unmute' : 'Mute'
  const DialogIcon = dialogUnmute ? Bell : BellOff

  function openConfirm() {
    setConfirmError(null)
    setConfirmKind(muted ? 'unmute' : 'mute')
    setConfirmOpen(true)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmError(null)
    setConfirmKind(null)
    onDialogClose?.()
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

  if (menuItem) {
    return (
      <View>
        <Pressable
          disabled={pending}
          onPress={() => openConfirm()}
          accessibilityLabel={`${label} ${targetName}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 12,
            paddingVertical: 12,
            minHeight: 52,
            opacity: pending ? 0.6 : 1,
          }}
        >
          <Icon size={18} color={t.onSurface} strokeWidth={1.5} />
          <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: t.onSurface }}>
            {label}
          </Text>
        </Pressable>
        <ConfirmSheet
          open={confirmOpen}
          onClose={() => { if (!pending) closeConfirm() }}
          title={dialogTitle}
          body={
            dialogUnmute
              ? `Unmuting ${targetName} shows their messages, posts, comments, and signals again right away.`
              : `Muting ${targetName} hides their messages, posts, comments, and signals for you only, in every shared cluster. Membership, votes, and presence stay the same. They are never told. You can unmute anytime.`
          }
          error={confirmError}
          confirmTitle={dialogLabel}
          confirmLoadingTitle="Saving…"
          confirmIcon={<DialogIcon size={16} color={t.onPrimary} strokeWidth={1.5} />}
          loading={pending}
          onConfirm={() => void handleConfirm()}
        />
      </View>
    )
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
          paddingHorizontal: 16,
          paddingVertical: 12,
          minHeight: fill ? 48 : 44,
          opacity: pending ? 0.6 : 1,
        }}
      >
        <Icon size={fill ? 16 : 14} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text
          style={{
            fontSize: fill ? 16 : 14,
            lineHeight: fill ? 24 : 20,
            fontWeight: '600',
            color: t.onSurfaceVariant,
          }}
        >
          {label}
        </Text>
      </Pressable>
      {error ? (
        <Text style={{ fontSize: 12, color: t.error }}>Couldn’t update. Try again.</Text>
      ) : null}
      <ConfirmSheet
        open={confirmOpen}
        onClose={() => { if (!pending) closeConfirm() }}
        title={dialogTitle}
        body={
          dialogUnmute
            ? `Unmuting ${targetName} shows their messages, posts, comments, and signals again right away.`
            : `Muting ${targetName} hides their messages, posts, comments, and signals for you only, in every shared cluster. Membership, votes, and presence stay the same. They are never told. You can unmute anytime.`
        }
        error={confirmError}
        confirmTitle={dialogLabel}
        confirmLoadingTitle="Saving…"
        confirmIcon={<DialogIcon size={16} color={t.onPrimary} strokeWidth={1.5} />}
        loading={pending}
        onConfirm={() => void handleConfirm()}
      />
    </View>
  )
}
