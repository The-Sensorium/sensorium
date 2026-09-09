import { Link } from 'expo-router'
import { Pressable, View } from 'react-native'
import { Avatar } from './Avatar'

export function AvatarLink({
  userId,
  clusterId,
  name,
  src,
  size,
}: {
  userId: string
  clusterId: string
  name: string
  src?: string | null
  size?: number
}) {
  return (
    <Link href={{ pathname: '/profile/[userId]', params: { userId, cluster: clusterId } }} asChild>
      <Pressable hitSlop={4}>
        {({ pressed }) => (
          <View style={{ opacity: pressed ? 0.6 : 1 }}>
            <Avatar name={name} src={src} size={size} />
          </View>
        )}
      </Pressable>
    </Link>
  )
}