import { Image } from 'react-native'
import { useResolvedScheme } from '../lib/theme-choice'
import lightMark from '../../assets/icon-mark-light.png'
import darkMark from '../../assets/icon-mark-dark.png'

export function BrandMark({
  size = 32,
  accessibilityLabel,
}: {
  size?: number
  accessibilityLabel?: string
}) {
  const scheme = useResolvedScheme()
  return (
    <Image
      source={scheme === 'dark' ? darkMark : lightMark}
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    />
  )
}
