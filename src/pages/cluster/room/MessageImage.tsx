import { useChatImageUrl } from '../../../features/cluster'

export function MessageImage({ path, alt }: { path: string; alt: string }) {
  const { data: src, isError } = useChatImageUrl(path)
  if (isError || !src) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl bg-surface-container text-sm text-on-surface-variant">
        Image unavailable
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="max-h-72 w-full rounded-xl object-cover"
    />
  )
}
