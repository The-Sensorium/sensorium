import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useAvatarUrl } from '../features/avatars'
import { Avatar } from './Avatar'

export function AvatarViewer({
  name,
  src,
  className,
  textClassName,
}: {
  name: string
  src?: string | null
  className?: string
  textClassName?: string
}) {
  const { data: resolved } = useAvatarUrl(src)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeBtnRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key === 'Tab') {
        const btn = closeBtnRef.current
        if (btn && e.target === btn) e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previouslyFocused?.focus()
    }
  }, [open])

  if (!resolved) {
    return <Avatar name={name} src={src} className={className} textClassName={textClassName} />
  }

  const label = `View ${name}'s profile photo`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Avatar name={name} src={src} className={className} textClassName={textClassName} />
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Profile photo preview"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-inverse-surface/90 p-4"
            onClick={() => setOpen(false)}
          >
            <button
              ref={closeBtnRef}
              type="button"
              aria-label="Close preview"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
              }}
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-surface/20 text-on-surface transition-colors hover:bg-surface/40"
            >
              <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </button>
            <img
              src={resolved}
              alt={label}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-lift"
            />
          </div>,
          document.body,
        )}
    </>
  )
}
