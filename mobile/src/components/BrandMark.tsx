import Svg, { Path } from 'react-native-svg'
import { useTheme } from '../lib/use-theme'
import { LOGO_MARK_D, LOGO_MARK_VIEWBOX } from './logoMarkPath'

export function BrandMark({
  size = 32,
  accessibilityLabel,
}: {
  size?: number
  accessibilityLabel?: string
}) {
  const t = useTheme()
  const [x, y, w, h] = LOGO_MARK_VIEWBOX.split(' ').map(Number)
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${x} ${y} ${w} ${h}`}
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    >
      <Path d={LOGO_MARK_D} fill={t.primary} />
    </Svg>
  )
}
