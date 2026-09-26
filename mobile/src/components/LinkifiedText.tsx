import { Text, Linking } from 'react-native'
import { parseLinks } from '../lib/links'
import { useTheme } from '../lib/use-theme'

/** Renders plain text with external http(s)/www URLs as tappable links. */
export function LinkifiedText({
  text,
  fontSize = 14,
  lineHeight = 20,
  color,
  numberOfLines,
  italic = false,
}: {
  text: string
  fontSize?: number
  lineHeight?: number
  color?: string
  numberOfLines?: number
  italic?: boolean
}) {
  const t = useTheme()
  const bodyColor = color ?? t.onSurface
  const parts = parseLinks(text)
  return (
    <Text
      style={{ fontSize, lineHeight, color: bodyColor, fontStyle: italic ? 'italic' : 'normal' }}
      numberOfLines={numberOfLines}
    >
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <Text key={i}>{part.value}</Text>
        ) : (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(part.href)}
            style={{ color: t.primary, textDecorationLine: 'underline', fontWeight: '600' }}
          >
            {part.value}
          </Text>
        ),
      )}
    </Text>
  )
}
