import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Send, Square, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  VOICE_MAX_BYTES,
  VOICE_MAX_SEC,
  extForVoiceMime,
  formatVoiceDuration,
  isAllowedVoiceMime,
  normalizeVoiceMime,
  probeWebRecordingMime,
} from '../../../lib/audio-format'
import { normalizePeaks, peaksFromAnalyserByteData } from '../../../lib/audio-waveform'
import { stopActiveVoicePlayback, type VoiceDraft } from '../../../features/voice-notes'

export function VoiceRecorder({
  onSend,
  onCancel,
  onError,
  sending,
}: {
  onSend(draft: VoiceDraft): Promise<void>
  onCancel(): void
  onError(message: string | null): void
  sending: boolean
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'paused' | 'preview'>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const peaksRef = useRef<number[]>([])
  const mimeRef = useRef('')
  const clockTimerRef = useRef<number | null>(null)
  const sampleTimerRef = useRef<number | null>(null)
  const clockRef = useRef<{ acc: number; since: number | null }>({ acc: 0, since: null })
  const draftRef = useRef<VoiceDraft | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  // Per-mount run id: StrictMode mounts, unmounts, and remounts in dev, so a
  // shared cancelled flag would stay true from the first cleanup and abort
  // the real mount's start() after getUserMedia resolves.
  const runRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const elapsedSec = Math.floor(elapsedMs / 1000)

  useEffect(() => {
    // Recording must not capture speaker output: stop any playing note or
    // preview the moment the recorder opens.
    stopActiveVoicePlayback()
    runRef.current += 1
    const run = runRef.current
    void start(() => runRef.current !== run)
    return () => {
      stopTracks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopTracks() {
    if (clockTimerRef.current) window.clearInterval(clockTimerRef.current)
    clockTimerRef.current = null
    if (sampleTimerRef.current) window.clearInterval(sampleTimerRef.current)
    sampleTimerRef.current = null
    try {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    } catch {
      // ignore
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }

  // Own stopwatch: MediaRecorder exposes no duration API, so track elapsed
  // time here (pause-aware). This drives the timer, the auto-stop, and the
  // stored duration.
  function tickClock() {
    const clock = clockRef.current
    if (clock.since === null) clock.since = Date.now()
    if (clockTimerRef.current) window.clearInterval(clockTimerRef.current)
    clockTimerRef.current = window.setInterval(() => {
      const c = clockRef.current
      const ms = c.acc + (c.since ? Date.now() - c.since : 0)
      setElapsedMs(ms)
      if (Math.floor(ms / 1000) >= VOICE_MAX_SEC) stopRecording()
    }, 250)
  }

  function freezeClock() {
    const clock = clockRef.current
    if (clock.since !== null) {
      clock.acc += Date.now() - clock.since
      clock.since = null
    }
    setElapsedMs(clock.acc)
    if (clockTimerRef.current) {
      window.clearInterval(clockTimerRef.current)
      clockTimerRef.current = null
    }
  }

  async function start(isCancelled: () => boolean) {
    onError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (isCancelled()) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const probe = probeWebRecordingMime()
      const options = probe ? { mimeType: probe, audioBitsPerSecond: 64000 } : undefined
      const rec = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream)
      mimeRef.current = normalizeVoiceMime(rec.mimeType || 'audio/mp4')
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => finishDraft()
      rec.onpause = () => {
        freezeClock()
        setPhase('paused')
      }
      rec.onresume = () => {
        tickClock()
        setPhase('recording')
      }
      recorderRef.current = rec
      const Ctx = window.AudioContext
      if (Ctx) {
        const ctx = new Ctx()
        ctxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        src.connect(analyser)
        const buf = new Uint8Array(analyser.frequencyBinCount)
        const sample = () => {
          if (recorderRef.current?.state !== 'recording') return
          analyser.getByteTimeDomainData(buf)
          peaksRef.current = [...peaksRef.current.slice(-1200), peaksFromAnalyserByteData(buf)]
        }
        if (sampleTimerRef.current) window.clearInterval(sampleTimerRef.current)
        sampleTimerRef.current = window.setInterval(sample, 120)
      }
      rec.start(250)
      tickClock()
      setPhase('recording')
    } catch {
      onError('Microphone blocked. Allow access to record.')
      onCancel()
    }
  }

  function stopRecording() {
    const rec = recorderRef.current
    if (rec && (rec.state === 'recording' || rec.state === 'paused')) {
      freezeClock()
      try {
        rec.stop()
      } catch {
        onCancel()
      }
    }
  }

  function finishDraft() {
    if (clockRef.current.acc < 800) {
      onError('Hold to record a voice note first.')
      onCancel()
      return
    }
    const type = mimeRef.current || 'audio/mp4'
    const blob = new Blob(chunksRef.current, { type })
    if (blob.size > VOICE_MAX_BYTES) {
      onError('Voice note must be 5 MB or smaller.')
      onCancel()
      return
    }
    const url = URL.createObjectURL(blob)
    previewUrlRef.current = url
    setPreviewUrl(url)
    const normalized = normalizePeaks(peaksRef.current.length > 0 ? peaksRef.current : [0.3], 56)
    draftRef.current = {
      blob,
      mime: isAllowedVoiceMime(type) ? normalizeVoiceMime(type) : 'audio/mp4',
      ext: extForVoiceMime(type),
      durationSec: Math.round(clockRef.current.acc / 1000),
      waveform: normalized,
    }
    setPhase('preview')
  }

  function togglePause() {
    const rec = recorderRef.current
    if (!rec) return
    if (rec.state === 'recording') rec.pause()
    else if (rec.state === 'paused') rec.resume()
  }

  async function handleSend() {
    const draft = draftRef.current
    if (!draft || sending) return
    if (draft.durationSec < 1) {
      onError('Hold to record a voice note first.')
      return
    }
    try {
      await onSend(draft)
    } catch {
      // caller surfaces the error
    }
  }

  if (phase === 'preview' && previewUrl && draftRef.current) {
    return (
      <div className="flex items-center gap-2" data-e2e="voice-preview">
        <button
          type="button"
          aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
          onClick={() => {
            const a = audioRef.current
            if (!a) return
            if (previewPlaying) {
              a.pause()
              setPreviewPlaying(false)
            } else {
              if (draftRef.current && a.currentTime >= draftRef.current.durationSec - 0.25) {
                try {
                  a.currentTime = 0
                } catch {
                  // fall through and try playing anyway
                }
              }
              void a.play().catch(() => {})
              setPreviewPlaying(true)
            }
          }}
          className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full bg-primary text-on-primary"
        >
          {previewPlaying ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
        </button>
        <audio
          ref={audioRef}
          src={previewUrl}
          onEnded={() => setPreviewPlaying(false)}
          className="hidden"
        />
        <span className="min-w-0 flex-1 text-sm font-semibold text-on-surface">
          Preview Audio ({formatVoiceDuration(draftRef.current.durationSec)})
        </span>
        <button
          type="button"
          aria-label="Discard voice note"
          disabled={sending}
          onClick={() => {
            stopTracks()
            onCancel()
          }}
          className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full text-error hover:bg-error-container/50 disabled:opacity-40"
        >
          <Trash2 className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Send voice note"
          data-e2e="voice-send"
          disabled={sending}
          onClick={() => void handleSend()}
          className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full bg-primary text-on-primary disabled:opacity-40"
        >
          <Send className="h-5 w-5" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-e2e="voice-recorder">
      <span className="shrink-0">
        <Mic
          className={cn('h-4 w-4', phase === 'recording' ? 'text-primary' : 'text-on-surface-variant')}
          aria-hidden
        />
      </span>
      <span className="truncate text-sm font-semibold text-on-surface">
        {formatVoiceDuration(elapsedSec)} / {formatVoiceDuration(VOICE_MAX_SEC)}
      </span>
      <span className="min-w-0 flex-1" />
      <button
        type="button"
        aria-label={phase === 'paused' ? 'Resume recording' : 'Pause recording'}
        onClick={togglePause}
        className="grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full border border-outline-variant/60 text-on-surface hover:bg-surface-container"
      >
        {phase === 'paused' ? <Play className="h-5 w-5" aria-hidden /> : <Pause className="h-5 w-5" aria-hidden />}
      </button>
      <button
        type="button"
        aria-label="Stop and preview"
        onClick={stopRecording}
        className="grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full border border-outline-variant/60 text-on-surface hover:bg-surface-container"
      >
        <Square className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Discard voice note"
        onClick={() => {
          stopTracks()
          onCancel()
        }}
        className="grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full text-error hover:bg-error-container/50"
      >
        <Trash2 className="h-5 w-5" aria-hidden />
      </button>
    </div>
  )
}
