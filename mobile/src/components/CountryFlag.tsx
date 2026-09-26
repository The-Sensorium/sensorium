import { View } from 'react-native'
import { Flag, countryCodes } from 'react-native-country-flag-icons'

/** Proper SVG flag for an ISO 3166-1 alpha-2 code. Renders nothing unknown. */
export function CountryFlag({ code, width = 24 }: { code: string; width?: number }) {
  const upper = code.toUpperCase()
  if (!(countryCodes as readonly string[]).includes(upper)) return null
  return (
    <View
      accessible={false}
      style={{
        width,
        height: (width * 2) / 3,
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Flag code={upper} width={width} />
    </View>
  )
}
