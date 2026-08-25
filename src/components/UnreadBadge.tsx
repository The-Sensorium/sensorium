/** Unread-count badge; caps the displayed number at 99+. Position absolutely
 inside a `relative` parent. */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      aria-label={`${count} unread notifications`}
      className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-error px-1 text-[10px] font-semibold leading-4 text-on-error"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
