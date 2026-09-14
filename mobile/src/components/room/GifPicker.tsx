import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
// Gesture-handler scroller, not the core one: the picker nests inside other
// vertical scrollers (posts page FlatList header), where a stock nested
// scroller loses every gesture to its parent. Deliberately a plain
// ScrollView, not a FlatList — React Native flags same-orientation nested
// VirtualizedLists with a LogBox warning and breaks their windowing. The
// grid is small (a page of KLIPY thumbs), so virtualization buys nothing.
// The app root is already wrapped in GestureHandlerRootView.
import { ScrollView } from 'react-native-gesture-handler'
import {
  useSearchGifs,
  useTrendingGifs,
  gifSearchEnabled,
  type Gif,
} from '../../features/gifs'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { Field } from '../ui'

// Approximate chrome around the grid: search field + attribution footer +
// container padding. Errs high so the footer never clips under the cap.
const PICKER_CHROME = 120

export function GifPicker({
  pending,
  onSelect,
  gridHeight,
}: {
  pending: boolean
  onSelect(gif: Gif): void
  /** Explicit grid height. Needed where the picker lives inside another
   * vertical scroller (posts composer sits in the page FlatList header):
   * a same-direction nested list is measured with unbounded height there,
   * so it expands to its full content instead of scrolling. Omit where the
   * picker already has a bounded window (chat dock). */
  gridHeight?: number
}) {
  const t = useTheme()
  const [query, setQuery] = useState('')
  const search = useSearchGifs(query)
  const trending = useTrendingGifs(true)
  const trimmed = query.trim()
  const gifs = trimmed ? search.data : trending.data
  const loading = trimmed ? search.isPending : trending.isPending
  const error = trimmed ? search.error : trending.error

  return (
    <View
      style={{
        backgroundColor: t.surfaceLowest,
        borderRadius: radii.xl,
        padding: 8,
        // Grows with an explicit grid so search field + grid + footer all
        // fit. The posts composer embeds this picker inside the page's
        // FlatList header; without clipping, grid rows taller than the cap
        // paint over the action row below.
        maxHeight: gridHeight ? gridHeight + PICKER_CHROME : 320,
        overflow: 'hidden',
      }}
    >
      <Field
        label=""
        value={query}
        onChangeText={setQuery}
        placeholder="Search KLIPY…"
        editable={gifSearchEnabled}
      />
      {!gifSearchEnabled ? (
        <Text style={{ padding: 12, textAlign: 'center', fontSize: 12, color: t.onSurfaceVariant }}>
          GIF search is not configured.
        </Text>
      ) : loading ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={t.primary} />
        </View>
      ) : error ? (
        <Text style={{ padding: 12, textAlign: 'center', fontSize: 14, color: t.error }}>
          Could not load GIFs.
        </Text>
      ) : !gifs || gifs.length === 0 ? (
        <Text style={{ padding: 12, textAlign: 'center', fontSize: 14, color: t.onSurfaceVariant }}>
          {trimmed ? 'No GIFs found.' : 'No trending GIFs available.'}
        </Text>
      ) : (
        <>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            // Android only. Lets the grid scroll inside a scrolling host.
            // Needs gridHeight to bound the scroll window.
            nestedScrollEnabled
            style={gridHeight ? { height: gridHeight } : undefined}
            contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}
          >
            {gifs.map((item) => (
              <Pressable
                key={String(item.id)}
                accessibilityLabel={`Send ${item.title || 'GIF'}`}
                disabled={pending}
                onPress={() => onSelect(item)}
                style={{ width: '33.3333%', aspectRatio: 16 / 9, padding: 3, opacity: pending ? 0.7 : 1 }}
              >
                <Image
                  source={{ uri: item.thumb }}
                  accessibilityLabel={item.title || 'GIF'}
                  resizeMode="cover"
                  style={{ flex: 1, width: '100%', borderRadius: radii.md, backgroundColor: t.surfaceContainer }}
                />
              </Pressable>
            ))}
          </ScrollView>
          <Text style={{ padding: 4, textAlign: 'center', fontSize: 10, color: t.onSurfaceVariant }}>
            Powered by KLIPY
          </Text>
        </>
      )}
    </View>
  )
}
