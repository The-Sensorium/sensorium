import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { formatVoiceDuration, voiceNoteLabel } from '../lib/audio-format'
import { decodeStoredWaveform } from '../lib/audio-waveform'
import { deleteVoiceNote, uploadVoiceNote, useSendMessage } from './cluster'

// MOBILE_VOICE_NOTES_FORK: same feature as web voice-notes.ts, but the send
// hook takes a file uri (Blob is unusable with Supabase Storage on React
// Native) and uploads via the ArrayBuffer path (upload-audio.ts).

export { formatVoiceDuration, voiceNoteLabel }

export interface VoiceDraft {
  uri: string
  mime: string
  durationSec: number
  waveform: number[]
}

type ActiveVoice = { messageId: string; rate: number } | null

let active: ActiveVoice = null
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function getActiveVoice(): ActiveVoice {
  return active
}

export function setActiveVoice(next: ActiveVoice) {
  active = next
  emit()
}

export function subscribeActiveVoice(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useActiveVoice(): ActiveVoice {
  return useSyncExternalStore(subscribeActiveVoice, getActiveVoice, getActiveVoice)
}

// Single audio focus across bubbles and the draft preview: starting any
// voice playback pauses whatever else is playing, so two notes (or a note
// and a draft preview) never overlap.
let pauseActiveVoicePlayback: (() => void) | null = null

export function claimVoicePlayback(pauseSelf: () => void): void {
  if (pauseActiveVoicePlayback && pauseActiveVoicePlayback !== pauseSelf) {
    try {
      pauseActiveVoicePlayback()
    } catch {
      // a stale player must never break starting the new one
    }
  }
  pauseActiveVoicePlayback = pauseSelf
}

export function releaseVoicePlayback(pauseSelf: () => void): void {
  if (pauseActiveVoicePlayback === pauseSelf) pauseActiveVoicePlayback = null
}

export function stopActiveVoicePlayback(): void {
  if (pauseActiveVoicePlayback) {
    try {
      pauseActiveVoicePlayback()
    } catch {
      // ignore
    }
    pauseActiveVoicePlayback = null
  }
}

export function waveformForMessage(raw: unknown): number[] | null {
  return decodeStoredWaveform(raw)
}

export function replyPreviewForMessage(message: {
  content: string | null
  image_url: string | null
  audio_url?: string | null
  audio_duration_sec?: number | null
}): string {
  if (message.content?.startsWith('gif:')) return 'GIF'
  if (message.image_url) return 'Image'
  if (message.audio_url) return voiceNoteLabel(message.audio_duration_sec)
  return message.content ?? 'message'
}

export function useSendVoiceNote() {
  const queryClient = useQueryClient()
  const send = useSendMessage()

  return useMutation({
    mutationFn: async ({
      clusterId,
      draft,
      replyToId,
    }: {
      clusterId: string
      draft: VoiceDraft
      replyToId?: string
    }) => {
      const path = await uploadVoiceNote(clusterId, draft.uri, draft.mime)
      try {
        return await send.mutateAsync({
          clusterId,
          content: null,
          replyToId,
          voice: {
            audioUrl: path,
            audioDurationSec: Math.round(draft.durationSec),
            audioWaveform: draft.waveform,
            audioMime: draft.mime,
          },
        })
      } catch (e) {
        await deleteVoiceNote(path).catch(() => {})
        throw e
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['cluster-messages', variables.clusterId] })
    },
  })
}
