import { Pressable, Text, View } from 'react-native'
import { Volume2, VolumeX } from 'lucide-react-native'
import { useAuth } from '../auth-context'
import { useIsMuted, useMuteUser, useUnmuteUser } from '../features/moderation'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export function MuteButton({ targetUserId, targetName, fill }: { targetUserId: string; targetName: string; fill?: boolean }) {
  const t = useTheme()
  const auth = useAuth()
  const selfId = auth.state === 'signedIn' ? auth.userId : null
  const muted = useIsMuted(targetUserId)
  const mute = useMuteUser()
  const unmute = useUnmuteUser()
  const pending = mute.isPending || unmute.isPending

  if (selfId !== null && targetUserId === selfId) return null

  const action = muted ? unmute : mute
  const label = muted ? 'Unmute' : 'Mute'
  const Icon = muted ? Volume2 : VolumeX
  const error = mute.error ?? unmute.error

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: fill ? 1 : 0 }}>
      <Pressable
        disabled={pending}
        onPress={() =>
          muted
            ? action.mutate({ targetUserId })
            : action.mutate({ targetUserId, displayName: targetName })
        }
        accessibilityLabel={`${label} ${targetName}`}
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
          paddingVertical: 8,
          opacity: pending ? 0.6 : 1,
        }}
      >
        <Icon size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>{label}</Text>
      </Pressable>
      {error ? (
        <Text style={{ fontSize: 12, color: t.error }}>Couldn’t update. Try again.</Text>
      ) : null}
    </View>
  )
}
