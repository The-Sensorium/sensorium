import { useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native'
import {
  useSearchGifs,
  useTrendingGifs,
  gifSearchEnabled,
  type Gif,
} from '../../features/gifs'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { Field } from '../ui'

export function GifPicker({ pending, onSelect }: { pending: boolean; onSelect(gif: Gif): void }) {
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
      style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 8, maxHeight: 320 }}
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
          <FlatList
            data={gifs}
            keyExtractor={(g) => String(g.id)}
            numColumns={3}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityLabel={`Send ${item.title || 'GIF'}`}
                disabled={pending}
                onPress={() => onSelect(item)}
                style={{ flex: 1 / 3, aspectRatio: 16 / 9, padding: 3, opacity: pending ? 0.7 : 1 }}
              >
                <Image
                  source={{ uri: item.thumb }}
                  accessibilityLabel={item.title || 'GIF'}
                  style={{ flex: 1, borderRadius: radii.md, backgroundColor: t.surfaceContainer }}
                />
              </Pressable>
            )}
          />
          <Text style={{ padding: 4, textAlign: 'center', fontSize: 10, color: t.onSurfaceVariant }}>
            Powered by KLIPY
          </Text>
        </>
      )}
    </View>
  )
}
