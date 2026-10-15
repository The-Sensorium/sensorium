import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatVoiceDuration } from '../../../lib/audio-format'
import { useVoiceNoteUrl } from '../../../features/cluster'
import { claimVoicePlayback, releaseVoicePlayback } from '../../../features/voice-notes'

export function VoiceBubble({
  path,
  durationSec,
  mine,
}: {
  path: string
  durationSec: number | null
  mine: boolean
}) {
  return <VoicePlayer path={path} total={durationSec ?? 0} mine={mine} />
}

function VoicePlayer({ path, total, mine }: { path: string; total: number; mine: boolean }) {
  const elRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [elemDuration, setElemDuration] = useState(0)
  const { data: src } = useVoiceNoteUrl(path, { refetch: !playing })
  const duration = total > 0 ? total : elemDuration

  const pauseSelf = useCallback(() => {
    elRef.current?.pause()
  }, [])

  useEffect(() => {
    if (!src) return
    const el = new Audio(src)
    el.preload = 'metadata'
    elRef.current = el
    const onTime = () => setElapsed(el.currentTime)
    const onPlay = () => {
      setPlaying(true)
      setElapsed(el.currentTime)
    }
    const onPause = () => {
      setPlaying(false)
      setElapsed(el.currentTime)
    }
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setElemDuration(Math.round(el.duration))
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onPause)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    return () => {
      releaseVoicePlayback(pauseSelf)
      el.pause()
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onPause)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
      el.removeAttribute('src')
      if (elRef.current === el) elRef.current = null
    }
  }, [src, pauseSelf])

  if (!src) {
    return (
      <span className="text-sm text-on-surface-variant">
        Voice note ({formatVoiceDuration(total)})
      </span>
    )
  }

  // A finished note sits at the end position, where play() would resume zero
  // milliseconds. Rewind first so every click plays from the start.
  async function toggle() {
    const el = elRef.current
    if (!el) return
    if (playing) {
      el.pause()
      releaseVoicePlayback(pauseSelf)
      return
    }
    if (duration > 0 && el.currentTime >= duration - 0.25) {
      try {
        el.currentTime = 0
      } catch {
        // fall through and try playing anyway
      }
    }
    claimVoicePlayback(pauseSelf)
    try {
      await el.play()
    } catch {
      releaseVoicePlayback(pauseSelf)
    }
  }

  return (
    <span className="inline-flex items-center gap-3" data-e2e="voice-bubble">
      <button
        type="button"
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        onClick={() => void toggle()}
        className={cn(
          'grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full transition-colors',
          mine ? 'bg-on-primary/20 text-on-primary hover:bg-on-primary/30' : 'bg-primary text-on-primary hover:bg-primary-container',
        )}
      >
        {playing ? (
          <Pause className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        ) : (
          <Play className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        )}
      </button>
      <span className={cn('text-sm font-semibold', mine ? 'text-on-primary/90' : 'text-on-surface')}>
        {formatVoiceDuration(elapsed)} / {formatVoiceDuration(duration)}
      </span>
    </span>
  )
}
