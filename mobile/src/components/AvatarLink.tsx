import { Link } from 'expo-router'
import { Pressable, View } from 'react-native'
import { Avatar } from './Avatar'

export function AvatarLink({
  userId,
  clusterId,
  name,
  src,
  thumbSrc,
  size,
}: {
  userId: string
  clusterId: string
  name: string
  src?: string | null
  thumbSrc?: string | null
  size?: number
}) {
  return (
    <Link href={{ pathname: '/profile/[userId]', params: { userId, cluster: clusterId } }} asChild>
      <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`}>
        {({ pressed }) => (
          <View style={{ opacity: pressed ? 0.6 : 1 }}>
            <Avatar name={name} src={src} thumbSrc={thumbSrc} size={size} />
          </View>
        )}
      </Pressable>
    </Link>
  )
}