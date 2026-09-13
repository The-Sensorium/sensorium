import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, G, Mask, Path } from 'react-native-svg'
import { useResolvedScheme } from '../lib/theme-choice'
import { colors, darkColors } from '../lib/theme-tokens'
import { LOGO_MARK_D } from './logoMarkPath'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export const SPLASH_DURATION_MS = 2200

// Logo bbox cropped from the trace (+ padding). Mask coords share this space.
const VIEWBOX = '880 1065 2200 1610'
// Centre of the 8: reveal expands from here, so the 8 blooms first and the
// brain sweeps in around it.
const EIGHT_CX = 1980
const EIGHT_CY = 1900
const REVEAL_R = 1300

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const scheme = useResolvedScheme()
  const palette = scheme === 'dark' ? darkColors : colors
  const stroke = palette.primary
  const backgroundColor = scheme === 'dark' ? '#1a1919' : '#fef8f7'

  const reveal = useSharedValue(0)
  const settle = useSharedValue(0.96)
  const fade = useSharedValue(1)

  useEffect(() => {
    reveal.value = withDelay(100, withTiming(REVEAL_R, { duration: 1300, easing: Easing.out(Easing.cubic) }))
    settle.value = withDelay(1050, withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.4)) }))
    fade.value = withDelay(
      SPLASH_DURATION_MS - 350,
      withTiming(0, { duration: 350, easing: Easing.out(Easing.ease) }, (finished) => {
        if (finished) runOnJS(onFinish)()
      }),
    )
  }, [fade, onFinish, reveal, settle])

  const circleProps = useAnimatedProps(() => ({ r: reveal.value }))
  const markStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: settle.value }],
  }))

  return (
    <View style={[styles.fill, { backgroundColor }]}>
      <Animated.View style={markStyle}>
        <Svg width={220} height={161} viewBox={VIEWBOX} accessibilityLabel="Sensorium logo">
          <Mask id="splashReveal" maskUnits="userSpaceOnUse" x={880} y={1065} width={2200} height={1610}>
            <AnimatedCircle cx={EIGHT_CX} cy={EIGHT_CY} r={0} fill="white" animatedProps={circleProps} />
          </Mask>
          <G mask="url(#splashReveal)">
            <Path d={LOGO_MARK_D} fill={stroke} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
