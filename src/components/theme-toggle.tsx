import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTheme, type ThemeMode } from '../lib/theme'

const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, resolved, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const TriggerIcon = resolved === 'dark' ? Moon : Sun

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label="Change theme"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((openState) => !openState)}
        className="flex h-9 w-9 items-center justify-center rounded-pill text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <TriggerIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 w-40 rounded-lg border border-outline-variant/60 bg-surface p-1.5 shadow-lift"
        >
          {options.map((opt) => {
            const active = mode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setMode(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary-container/15 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                )}
              >
                <opt.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                <span className="flex-1 text-left">{opt.label}</span>
                {active && <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
