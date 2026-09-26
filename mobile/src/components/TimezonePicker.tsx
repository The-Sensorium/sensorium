import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { timeZoneList } from '../lib/timezones'
import { radii, spacing } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { Field } from './ui'

/** Searchable IANA timezone picker (pressable + modal list). */
export function TimezonePicker({
  value,
  onChange,
  placeholder = 'Select your timezone…',
}: {
  value: string
  onChange: (tz: string) => void
  placeholder?: string
}) {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const zones = useMemo(() => timeZoneList(), [])
  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones),
    [q, zones],
  )

  return (
    <View>
      <Pressable
        onPress={() => {
          setQuery('')
          setOpen(true)
        }}
        style={{
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.outlineVariant,
          borderRadius: radii.md,
          paddingHorizontal: 16,
          paddingVertical: 12,
          minHeight: 48,
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16, lineHeight: 24, color: value ? t.onSurface : t.onSurfaceVariant }}>
          {value || placeholder}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
          <View style={{ padding: spacing.gutter }}>
            <Field label="Search" value={query} onChangeText={setQuery} placeholder="Start typing…" />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(z) => z}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item)
                  setOpen(false)
                }}
                style={{ paddingHorizontal: spacing.containerMargin, paddingVertical: 12, minHeight: 48, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 16, lineHeight: 24, color: t.onSurface }}>{item}</Text>
              </Pressable>
            )}
          />
          <Pressable
            onPress={() => setOpen(false)}
            style={{ padding: spacing.gutter, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.primary }}>Close</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  )
}
