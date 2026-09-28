import { View } from 'react-native'
import { Flag, countryCodes } from 'react-native-country-flag-icons'

/** Proper SVG flag for an ISO 3166-1 alpha-2 code. Decorative by default;
 * pass `label` when no adjacent country name carries the accessible name. */
export function CountryFlag({ code, width = 24, label }: { code: string; width?: number; label?: string }) {
  const upper = code.toUpperCase()
  if (!(countryCodes as readonly string[]).includes(upper)) return null
  return (
    <View
      accessible={label !== undefined}
      accessibilityLabel={label}
      accessibilityRole={label !== undefined ? 'image' : undefined}
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
