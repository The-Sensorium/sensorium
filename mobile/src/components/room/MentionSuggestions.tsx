import { FlatList, Pressable, Text, View } from 'react-native'
import { Users } from 'lucide-react-native'
import { Avatar } from '../Avatar'
import type { MentionMember } from '../../features/mentions'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'

export type MentionOption =
  | { key: string; kind: 'everyone' }
  | { key: string; kind: 'member'; member: MentionMember }

/**
 * Shared @-mention suggestion dropdown, extracted from the chat composer.
 * Presentational only: the caller owns the query state and insertion.
 */
export function MentionSuggestions({
  options,
  onSelectEveryone,
  onSelectMember,
}: {
  options: MentionOption[]
  onSelectEveryone(): void
  onSelectMember(member: MentionMember): void
}) {
  const t = useTheme()
  return (
    <View
      accessibilityLabel={`Mention suggestions, ${options.length} available`}
      style={{
        position: 'absolute',
        bottom: '100%',
        start: 0,
        minWidth: 176,
        maxWidth: '85%',
        marginBottom: 8,
        maxHeight: 216,
        backgroundColor: t.surface,
        borderRadius: radii.xl,
      }}
    >
      <FlatList
        data={options}
        keyExtractor={(option) => option.key}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ padding: 4 }}
        renderItem={({ item: option }) =>
          option.kind === 'everyone' ? (
            <Pressable
              onPress={() => onSelectEveryone()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Mention everyone"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 12, minHeight: 48 }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}>
                <Users size={16} color={t.primary} strokeWidth={1.5} />
              </View>
              <Text style={{ fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                everyone
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => onSelectMember(option.member)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Mention ${option.member.display_name}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 12, minHeight: 48 }}
            >
              <Avatar name={option.member.display_name} src={option.member.avatar_url} size={24} />
              <Text style={{ fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                {option.member.display_name}
              </Text>
            </Pressable>
          )
        }
      />
    </View>
  )
}
