import { memo, useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { GestureResponderEvent } from 'react-native'
import { displayEmoji } from 'rn-expo-emoji-picker/flatlist'
import type { EmojiCategoryKey, EmojiItem, SkinTone } from 'rn-expo-emoji-picker/flatlist'

export interface PreciseEmojiRowProps {
  emojis: EmojiItem[]
  category: EmojiCategoryKey
  numColumns: number
  rowHeight: number
  emojiSize: number
  skinTone: SkinTone
  onPress: (item: EmojiItem, category: EmojiCategoryKey) => void
  onLongPress: (item: EmojiItem, category: EmojiCategoryKey, anchor: { x: number; y: number }) => void
}

// One touch target per emoji instead of the library default of one per row
// with the tapped column derived from the touch x-position. The x-position
// math can attribute a tap to a neighboring cell (e.g. tapping melting face
// stores slightly smiling face), and nothing downstream can detect the swap:
// the RPC stores the glyph verbatim. Per-cell targets remove the guess at the
// cost of more views per row, which is fine for our bounded 360px picker.
// Stateless and fully prop-driven, like the default row, so list recycling
// stays correct.
export const PreciseEmojiRow = memo(function PreciseEmojiRow({
  emojis,
  category,
  numColumns,
  rowHeight,
  emojiSize,
  skinTone,
  onPress,
  onLongPress,
}: PreciseEmojiRowProps) {
  // Row width only positions the skin-tone variant popover; it lives in a
  // ref so layout never re-renders a recycled row.
  const rowWidthRef = useRef(0)

  function anchorFor(e: GestureResponderEvent) {
    const { pageX, pageY, locationX, locationY } = e.nativeEvent
    const cellWidth = rowWidthRef.current > 0 ? rowWidthRef.current / numColumns : 0
    // locationX is cell-relative (the cell is the view that was hit), so
    // pageX - locationX is already the cell left edge. Cells fill the full
    // row height, so the cell top is the row top.
    return {
      x: pageX - locationX + cellWidth / 2,
      y: pageY - locationY,
    }
  }

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', height: rowHeight }}
      onLayout={(e) => {
        rowWidthRef.current = e.nativeEvent.layout.width
      }}
    >
      {emojis.map((item) => (
        <Pressable
          key={item.slug}
          accessibilityRole="button"
          accessibilityLabel={item.name}
          onPress={() => onPress(item, category)}
          onLongPress={(e) => {
            if (!item.toneTemplate) return
            onLongPress(item, category, anchorFor(e))
          }}
          style={{ flex: 1, height: rowHeight, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: emojiSize }} allowFontScaling={false}>
            {displayEmoji(item, skinTone)}
          </Text>
        </Pressable>
      ))}
      {emojis.length < numColumns && <View style={{ flex: numColumns - emojis.length }} />}
    </View>
  )
})
