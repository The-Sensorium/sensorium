import { useEffect, type ReactNode } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

// Collapsible composer chrome (avatar, action buttons). Stays mounted and
// animates width + opacity via shared value so siblings reflow smoothly. No
// layout prop is used anywhere near the TextInput: layout transitions on its
// ancestors fight its content-driven height and clip the text on keystrokes.
export function CollapsibleChrome({
  shown,
  width,
  height = 44,
  children,
}: {
  shown: boolean
  width: number
  height?: number
  children: ReactNode
}) {
  const progress = useSharedValue(shown ? 1 : 0)
  useEffect(() => {
    progress.value = withTiming(shown ? 1 : 0, { duration: 200 })
  }, [shown, progress])
  const style = useAnimatedStyle(() => ({
    width: progress.value * width,
    opacity: progress.value,
    // Cancel the parent row's gap when collapsed so no dead space remains.
    // (No `accessible` prop: accessible={true} would group the inner buttons
    // into one iOS accessible element and hide their individual labels.)
    marginRight: (progress.value - 1) * 4,
  }))
  return (
    <Animated.View
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[{ height, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {children}
    </Animated.View>
  )
}
