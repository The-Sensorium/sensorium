import { Pressable, Text, View } from 'react-native'
import { EyeOff } from 'lucide-react-native'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export type MutedKind = 'message' | 'post' | 'comment' | 'signal'

export function MutedPlaceholder({
  name,
  onToggle,
  kind = 'message',
}: {
  name: string
  onToggle: () => void
  kind?: MutedKind
}) {
  const t = useTheme()
  return (
    <View
      style={{
        backgroundColor: t.surfaceContainer,
        borderRadius: radii.md,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <EyeOff size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
      <Text style={{ flex: 1, fontSize: 14, color: t.onSurfaceVariant }}>
        {kind === 'post'
          ? `Muted ${name}’s post`
          : kind === 'comment'
            ? `Muted ${name}’s comment`
            : kind === 'signal'
              ? `Muted ${name}’s signal`
              : `Muted ${name}’s message`}
      </Text>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel="Show muted content"
        hitSlop={8}
        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: t.primary }}>Show</Text>
      </Pressable>
    </View>
  )
}

export function MutedHideBar({
  name,
  onToggle,
  kind = 'message',
}: {
  name: string
  onToggle: () => void
  kind?: MutedKind
}) {
  const t = useTheme()
  return (
    <View
      style={{
        backgroundColor: t.surfaceContainer,
        borderRadius: radii.md,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <EyeOff size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
      <Text style={{ flex: 1, fontSize: 14, color: t.onSurfaceVariant }}>
        Showing muted {kind} from {name}.
      </Text>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Hide muted ${kind}`}
        hitSlop={8}
        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: t.primary }}>Hide</Text>
      </Pressable>
    </View>
  )
}
