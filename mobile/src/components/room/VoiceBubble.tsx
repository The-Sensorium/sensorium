import { useCallback, useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { Pause, Play } from 'lucide-react-native'
import { formatVoiceDuration } from '../../lib/audio-format'
import { useVoiceNoteUrl } from '../../features/cluster'
import { claimVoicePlayback, releaseVoicePlayback } from '../../features/voice-notes'
import { useTheme } from '../../lib/use-theme'

export function VoiceBubble({
  path,
  durationSec,
  mine,
}: {
  path: string
  durationSec: number | null
  mine: boolean
}) {
  const t = useTheme()
  const { data: src } = useVoiceNoteUrl(path, { refetch: false })
  const total = durationSec ?? 0

  if (!src) {
    return (
      <Text style={{ fontSize: 13, color: mine ? t.onPrimary : t.onSurfaceVariant }}>
        Voice note ({formatVoiceDuration(total)})
      </Text>
    )
  }
  return <VoicePlayer path={path} src={src} total={total} mine={mine} />
}

function VoicePlayer({ path, src, total, mine }: { path: string; src: string; total: number; mine: boolean }) {
  const t = useTheme()
  const player = useAudioPlayer({ uri: src })
  const status = useAudioPlayerStatus(player)
  // Same query key as above: suspends rotation of the signed URL while this
  // note plays, so a refresh cannot rebuild the player mid-playback.
  useVoiceNoteUrl(path, { refetch: !status.playing })

  const pauseSelf = useCallback(() => player.pause(), [player])
  useEffect(() => {
    return () => releaseVoicePlayback(pauseSelf)
  }, [pauseSelf])

  // A finished note sits at the end position, where play() would resume
  // zero milliseconds. Rewind first so every tap plays from the start.
  async function toggleAsync() {
    if (status.playing) {
      player.pause()
      releaseVoicePlayback(pauseSelf)
    } else {
      if (duration > 0 && elapsed >= duration - 0.25) {
        try {
          await player.seekTo(0)
        } catch {
          // fall through and try playing anyway
        }
      }
      claimVoicePlayback(pauseSelf)
      player.play()
    }
  }

  const duration = total > 0 ? total : Math.round(status.duration ?? 0)
  const elapsed = status.currentTime ?? 0

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable
        accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
        onPress={() => void toggleAsync()}
        hitSlop={8}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: mine ? 'rgba(0,0,0,0.15)' : t.primary,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {status.playing ? (
          <Pause size={20} color={t.onPrimary} />
        ) : (
          <Play size={20} color={t.onPrimary} />
        )}
      </Pressable>
      <Text style={{ fontSize: 14, fontWeight: '600', color: mine ? t.onPrimary : t.onSurface, flexShrink: 0 }}>
        {formatVoiceDuration(elapsed)} / {formatVoiceDuration(duration)}
      </Text>
    </View>
  )
}
