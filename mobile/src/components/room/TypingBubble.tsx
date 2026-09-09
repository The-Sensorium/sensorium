import { useEffect, useState } from 'react'
import { Animated, Easing, View } from 'react-native'
import { AvatarLink } from '../AvatarLink'
import { useTheme } from '../../lib/use-theme'

export function TypingBubble({
  name,
  avatarUrl,
  userId,
  clusterId,
}: {
  name: string
  avatarUrl: string | null
  userId: string
  clusterId: string
}) {
  const t = useTheme()
  const [pulse] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] })

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 }}>
      <AvatarLink userId={userId} clusterId={clusterId} name={name} src={avatarUrl} size={28} />
      <Animated.View
        style={{
          opacity,
          backgroundColor: t.surfaceContainer,
          borderRadius: 16,
          borderBottomLeftRadius: 4,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          gap: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.onSurfaceVariant }} />
        ))}
      </Animated.View>
    </View>
  )
}
