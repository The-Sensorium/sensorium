import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Flag, MoreVertical, User } from 'lucide-react'
import { MuteButton } from './MuteButton'
import { cn } from '../lib/utils'

const rowClass =
  'flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container'

export function MemberCardMenu({
  member,
  clusterId,
  isSelf,
  open,
  onOpen,
  onClose,
  onReport,
}: {
  member: { id: string; display_name: string }
  clusterId: string
  isSelf: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  onReport: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [menuAbove, setMenuAbove] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function toggleMenu() {
    if (open) {
      onClose()
      return
    }
    const wrap = wrapRef.current
    if (wrap) {
      const rect = wrap.getBoundingClientRect()
      setMenuAbove(rect.top > window.innerHeight - rect.bottom)
    } else {
      setMenuAbove(false)
    }
    onOpen()
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Member options for ${member.display_name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleMenu}
        className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <MoreVertical className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close member menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={onClose}
            tabIndex={-1}
          />
          <div
            role="menu"
            aria-label={`Options for ${member.display_name}`}
            className={cn(
              'absolute right-0 z-20 flex w-40 flex-col rounded-2xl border border-outline-variant/60 bg-surface p-2 shadow-lift',
              menuAbove ? 'bottom-full mb-2' : 'top-full mt-1',
            )}
          >
            <Link
              to={`/profile/${member.id}?cluster=${clusterId}`}
              role="menuitem"
              onClick={onClose}
              className={rowClass}
            >
              <User className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              View profile
            </Link>
            {!isSelf && (
              <>
                <div aria-hidden className="mx-3 h-px bg-outline-variant/40" />
                <MuteButton
                  targetUserId={member.id}
                  targetName={member.display_name}
                  menuItem
                  onDialogClose={onClose}
                />
              </>
            )}
            {!isSelf && (
              <>
                <div aria-hidden className="mx-3 h-px bg-outline-variant/40" />
                <button type="button" role="menuitem" onClick={onReport} className={rowClass}>
                  <Flag className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  Report
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
