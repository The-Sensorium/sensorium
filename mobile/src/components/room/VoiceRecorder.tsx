import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { Mic, Pause, Play, Send, Square, Trash2, X } from 'lucide-react-native'
import { claimVoicePlayback, releaseVoicePlayback, stopActiveVoicePlayback } from '../../features/voice-notes'
import { VOICE_MAX_SEC, extForVoiceMime, formatVoiceDuration } from '../../lib/audio-format'
import { normalizePeaks } from '../../lib/audio-waveform'
import { useTheme } from '../../lib/use-theme'
import { errorHaptic } from '../../lib/haptics'

export interface VoiceRecording {
  uri: string
  mime: string
  durationSec: number
  waveform: number[]
}

function meteringToPeak(metering: number | undefined): number {
  if (metering === undefined || !Number.isFinite(metering)) return 0.15
  if (metering <= 1 && metering >= -1) return Math.min(1, Math.max(0.05, Math.abs(metering)))
  const db = Math.max(-60, Math.min(0, metering))
  return Math.min(1, Math.max(0.05, (db + 60) / 60))
}

function mimeForUri(uri: string): string {
  const lower = uri.split('?')[0]?.toLowerCase() ?? ''
  if (lower.endsWith('.mp4')) return 'audio/mp4'
  if (lower.endsWith('.aac')) return 'audio/aac'
  if (lower.endsWith('.webm')) return 'audio/webm'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  return 'audio/m4a'
}

export function VoiceRecorder({
  sending,
  onSend,
  onCancel,
  onError,
}: {
  sending: boolean
  onSend(recording: VoiceRecording): Promise<void>
  onCancel(): void
  onError(message: string | null): void
}) {
  const t = useTheme()
  // Recording must not capture speaker output: stop any playing note or
  // preview the moment the recorder opens.
  useEffect(() => {
    stopActiveVoicePlayback()
  }, [])
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder, 200)
  const [failed, setFailed] = useState(false)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const peaksRef = useRef<number[]>([])
  const stoppedRef = useRef(false)
  // Own stopwatch: recorderState.durationMillis does not tick reliably, so
  // track elapsed time here (pause-aware, ms precision). This drives the
  // timer display, the 2:00 auto-stop, and the stored duration.
  const clockRef = useRef<{ acc: number; since: number | null }>({ acc: 0, since: null })
  const [elapsedMs, setElapsedMs] = useState(0)
  const elapsedSec = Math.floor(elapsedMs / 1000)

  useEffect(() => {
    if (previewUri) return
    if (recorderState.isRecording) {
      const clock = clockRef.current
      if (clock.since === null) clock.since = Date.now()
      const iv = window.setInterval(() => {
        setElapsedMs(clock.acc + (clock.since ? Date.now() - clock.since : 0))
      }, 250)
      return () => {
        if (clock.since !== null) {
          clock.acc += Date.now() - clock.since
          clock.since = null
        }
        setElapsedMs(clock.acc)
        window.clearInterval(iv)
      }
    }
    const clock = clockRef.current
    if (clock.since !== null) {
      clock.acc += Date.now() - clock.since
      clock.since = null
    }
    setElapsedMs(clock.acc)
  }, [previewUri, recorderState.isRecording])

  useEffect(() => {
    let cancelled = false
    async function prepare() {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync()
        if (!perm.granted) {
          onError('Microphone blocked. Allow access in Settings to record.')
          onCancel()
          return
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
        if (cancelled) return
        await recorder.prepareToRecordAsync()
        if (cancelled) return
        recorder.record()
      } catch {
        if (!cancelled) {
          setFailed(true)
          errorHaptic()
          onError('Could not start recording. Try again.')
        }
      }
    }
    void prepare()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!previewUri && recorderState.isRecording) {
      const peak = meteringToPeak(recorderState.metering)
      peaksRef.current = [...peaksRef.current.slice(-1200), peak]
    }
  }, [previewUri, recorderState.isRecording, recorderState.metering])

  useEffect(() => {
    if (!previewUri && elapsedSec >= VOICE_MAX_SEC && recorderState.isRecording && !stoppedRef.current) {
      stoppedRef.current = true
      void stopToPreview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSec, previewUri])

  async function stopToPreview() {
    try {
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) throw new Error('No recording')
      const clock = clockRef.current
      if (clock.since !== null) {
        clock.acc += Date.now() - clock.since
        clock.since = null
      }
      if (clock.acc < 800) {
        onError('Hold to record a voice note first.')
        onCancel()
        return
      }
      setPreviewUri(uri)
    } catch {
      setFailed(true)
      onError('Could not finish that recording. Try again.')
    }
  }

  if (failed && !previewUri) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <Text style={{ flex: 1, fontSize: 14, color: t.error }}>Recording failed. Try again.</Text>
        <Pressable
          accessibilityLabel="Dismiss voice recorder"
          onPress={onCancel}
          hitSlop={8}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <X size={20} color={t.onSurfaceVariant} />
        </Pressable>
      </View>
    )
  }

  if (previewUri) {
    return (
      <VoicePreview
        uri={previewUri}
        durationSec={Math.round(clockRef.current.acc / 1000)}
        peaks={peaksRef.current}
        sending={sending}
        onSend={onSend}
        onDiscard={onCancel}
        onError={onError}
      />
    )
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      <View style={{ flexShrink: 0 }}>
        <Mic size={18} color={recorderState.isRecording ? t.primary : t.onSurfaceVariant} />
      </View>
      <Text
        numberOfLines={1}
        style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', color: t.onSurface }}
      >
        {formatVoiceDuration(elapsedSec)} / {formatVoiceDuration(VOICE_MAX_SEC)}
      </Text>
      <View style={{ flex: 1, minWidth: 0 }} />
      <Pressable
        accessibilityLabel={recorderState.isRecording ? 'Pause recording' : 'Resume recording'}
        onPress={() => {
          if (recorderState.isRecording) recorder.pause()
          else recorder.record()
        }}
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        {recorderState.isRecording ? (
          <Pause size={20} color={t.onSurface} />
        ) : (
          <Play size={20} color={t.onSurface} />
        )}
      </Pressable>
      <Pressable
        accessibilityLabel="Stop and preview"
        onPress={() => {
          stoppedRef.current = true
          void stopToPreview()
        }}
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Square size={20} color={t.onSurface} />
      </Pressable>
      <Pressable
        accessibilityLabel="Discard voice note"
        onPress={onCancel}
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Trash2 size={20} color={t.error} />
      </Pressable>
    </View>
  )
}

function VoicePreview({
  uri,
  durationSec,
  peaks,
  sending,
  onSend,
  onDiscard,
  onError,
}: {
  uri: string
  durationSec: number
  peaks: number[]
  sending: boolean
  onSend(recording: VoiceRecording): Promise<void>
  onDiscard(): void
  onError(message: string | null): void
}) {
  const t = useTheme()
  const player = useAudioPlayer({ uri })
  const status = useAudioPlayerStatus(player)
  const waveform = normalizePeaks(peaks.length > 0 ? peaks : [0.3], 56)
  const elapsed = status.currentTime ?? 0

  const pauseSelf = useCallback(() => player.pause(), [player])
  useEffect(() => {
    return () => releaseVoicePlayback(pauseSelf)
  }, [pauseSelf])

  // After a finished preview the player sits at the end position, where
  // play() would resume zero milliseconds. Rewind first so every tap plays.
  async function togglePreviewPlay() {
    if (status.playing) {
      player.pause()
      releaseVoicePlayback(pauseSelf)
      return
    }
    if (durationSec > 0 && (status.currentTime ?? 0) >= durationSec - 0.25) {
      try {
        await player.seekTo(0)
      } catch {
        // fall through and try playing anyway
      }
    }
    claimVoicePlayback(pauseSelf)
    player.play()
  }

  async function handleSend() {
    if (sending) return
    if (durationSec < 1) {
      onError('Hold to record a voice note first.')
      return
    }
    const mime = mimeForUri(uri)
    if (extForVoiceMime(mime) === 'm4a' && uri.toLowerCase().endsWith('.3gp')) {
      onError('That recording format is not supported on this device.')
      return
    }
    try {
      await onSend({ uri, mime, durationSec, waveform })
    } catch {
      // caller surfaces the error
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      <Pressable
        accessibilityLabel={status.playing ? 'Pause preview' : 'Play preview'}
        onPress={() => void togglePreviewPlay()}
        hitSlop={8}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: t.primary,
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
          Preview Audio
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }} numberOfLines={1}>
          {formatVoiceDuration(elapsed)} / {formatVoiceDuration(durationSec)}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Discard voice note"
        disabled={sending}
        onPress={onDiscard}
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: sending ? 0.4 : 1 }}
      >
        <Trash2 size={20} color={t.error} />
      </Pressable>
      <Pressable
        accessibilityLabel="Send voice note"
        disabled={sending}
        onPress={() => void handleSend()}
        hitSlop={8}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: t.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: sending ? 0.4 : 1,
        }}
      >
        {sending ? (
          <ActivityIndicator size="small" color={t.onPrimary} />
        ) : (
          <Send size={20} color={t.onPrimary} />
        )}
      </Pressable>
    </View>
  )
}
