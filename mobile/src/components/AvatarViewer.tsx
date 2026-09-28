import { useState } from 'react'
import { Pressable } from 'react-native'
import { useAvatarUrl } from '../features/avatars'
import { Avatar } from './Avatar'
import { ZoomableImage } from './ZoomableImage'

export function AvatarViewer({
  name,
  src,
  size,
}: {
  name: string
  src?: string | null
  size?: number
}) {
  const { data: resolved } = useAvatarUrl(src)
  const [open, setOpen] = useState(false)

  if (!resolved) {
    return <Avatar name={name} src={src} size={size} />
  }

  const label = `View ${name}'s profile photo`

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel={label} accessibilityRole="button">
        <Avatar name={name} src={src} size={size} />
      </Pressable>
      <ZoomableImage uri={resolved} accessibilityLabel={label} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
