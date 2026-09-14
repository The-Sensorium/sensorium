import { Text, View, type ViewStyle } from 'react-native'
import { VideoTrack, isTrackReference } from '@livekit/react-native'
import type { TrackReferenceOrPlaceholder } from '@livekit/react-native'
import { MicOff } from 'lucide-react-native'
import { Avatar } from '../../Avatar'
import { radii } from '../../../lib/theme-tokens'
import { useTheme } from '../../../lib/use-theme'

interface ParticipantTileProps {
  trackRef: TrackReferenceOrPlaceholder
  speaking: boolean
  style?: ViewStyle
}

/** One call tile: live video when the camera is on, avatar + name otherwise. */
export function ParticipantTile({ trackRef, speaking, style }: ParticipantTileProps) {
  const t = useTheme()
  const { participant } = trackRef
  const name = participant.name || 'Member'
  const videoLive = isTrackReference(trackRef) && !trackRef.publication.isMuted

  return (
    <View
      style={[
        {
          borderRadius: radii.xl,
          overflow: 'hidden',
          backgroundColor: t.surfaceContainer,
          borderWidth: 2,
          borderColor: speaking ? t.primary : 'transparent',
        },
        style,
      ]}
    >
      {videoLive ? (
        <VideoTrack trackRef={trackRef} style={{ flex: 1 }} mirror={participant.isLocal} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Avatar name={name} size={56} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
            {name}
            {participant.isLocal ? ' (you)' : ''}
          </Text>
        </View>
      )}
      <View
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: radii.pill,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#fff' }} numberOfLines={1}>
          {name}
        </Text>
        {!participant.isMicrophoneEnabled ? (
          <MicOff size={14} color="#fff" strokeWidth={2} />
        ) : null}
      </View>
    </View>
  )
}
