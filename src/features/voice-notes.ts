import { useMutation, useQueryClient } from '@tanstack/react-query'
import { voiceNoteLabel } from '../lib/audio-format'
import { deleteVoiceNote, uploadVoiceNote, useSendMessage, type SendVoiceNote } from './cluster'

export type { SendVoiceNote }

export interface VoiceDraft {
  blob: Blob
  mime: string
  ext: string
  durationSec: number
  waveform: number[]
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
      const path = await uploadVoiceNote(clusterId, draft.blob, draft.mime, draft.ext)
      const voice: SendVoiceNote = {
        audioUrl: path,
        audioDurationSec: Math.round(draft.durationSec),
        audioWaveform: draft.waveform,
        audioMime: draft.mime,
      }
      try {
        return await send.mutateAsync({
          clusterId,
          content: null,
          replyToId,
          voice,
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
