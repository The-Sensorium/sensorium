/** Unread-count badge; caps the displayed number at 9+. Position absolutely
 inside a `relative` parent. */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      aria-label={`${count} unread notifications`}
      className="absolute -right-1 -top-1 grid min-h-[20px] min-w-[20px] place-items-center rounded-full bg-error px-1 text-[11px] font-semibold leading-4 text-on-error"
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}
