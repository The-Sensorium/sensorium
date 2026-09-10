import { ScrollView, Text, View } from 'react-native'
import { useSpeakingParticipants, useTracks } from '@livekit/react-native'
import { Track } from 'livekit-client'
import { ParticipantTile } from './ParticipantTile'
import { useTheme } from '../../../lib/use-theme'

/**
 * Tile grid sized to the participant count: one fills the stage; two stack
 * full-width halves (nice on portrait phones); three to four use a 2×2; five or
 * more scroll in two columns.
 */
export function CallGrid() {
  const t = useTheme()
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  })
  const speakers = useSpeakingParticipants()
  const speaking = new Set(speakers.map((participant) => participant.identity))

  if (tracks.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant, textAlign: 'center' }}>
          Connected — waiting for others to join.
        </Text>
      </View>
    )
  }

  const tile = (trackRef: (typeof tracks)[number]) => (
    <ParticipantTile
      key={trackRef.participant.identity}
      trackRef={trackRef}
      speaking={speaking.has(trackRef.participant.identity)}
      style={{ flex: 1 }}
    />
  )

  if (tracks.length <= 4) {
    const columns = tracks.length <= 2 ? 1 : 2
    const rows = Math.ceil(tracks.length / columns)
    return (
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
        {tracks.map((trackRef) => (
          <View
            key={trackRef.participant.identity}
            style={{ width: `${100 / columns}%`, height: `${100 / rows}%`, padding: 4 }}
          >
            {tile(trackRef)}
          </View>
        ))}
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 4 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {tracks.map((trackRef) => (
          <View key={trackRef.participant.identity} style={{ width: '50%', padding: 4 }}>
            <View style={{ aspectRatio: 3 / 4 }}>{tile(trackRef)}</View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}
