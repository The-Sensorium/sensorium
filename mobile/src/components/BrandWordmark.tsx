import { Text } from 'react-native'
import { useTheme } from '../lib/use-theme'

export function BrandWordmark({ size = 20 }: { size?: number }) {
  const t = useTheme()
  return (
    <Text
      style={{
        textAlign: 'center',
        fontSize: size,
        fontWeight: '400',
        letterSpacing: 3,
        color: t.primary,
        fontFamily: 'SpecialElite_400Regular',
      }}
    >
      Sensorium
    </Text>
  )
}
