import { useEffect, useState } from 'react'
import { AccessibilityInfo, View } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
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
  const pulse = useSharedValue(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let live = true
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (live) setReduceMotion(enabled)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1
      return
    }
    pulse.value = withRepeat(withTiming(1, { duration: 600 }), -1, true)
  }, [pulse, reduceMotion])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.4, 1]),
  }))

  return (
    <View
      accessible
      accessibilityLabel={`${name} is typing`}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 }}
    >
      <AvatarLink userId={userId} clusterId={clusterId} name={name} src={avatarUrl} size={28} />
      <Animated.View
        style={[
          {
            backgroundColor: t.surfaceContainer,
            borderRadius: 16,
            borderBottomLeftRadius: 4,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            gap: 4,
          },
          animatedStyle,
        ]}
      >
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.onSurfaceVariant }} />
        ))}
      </Animated.View>
    </View>
  )
}
