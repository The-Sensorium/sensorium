import { Text } from 'react-native'
import { parseMentions, type MentionMember } from '../../features/mentions'
import { useTheme } from '../../lib/use-theme'

export function MentionText({ content, members }: { content: string; members: MentionMember[] }) {
  const t = useTheme()
  const parts = parseMentions(content, members)
  return (
    <Text style={{ fontSize: 14, lineHeight: 22, color: t.onSurface }}>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <Text key={i}>{part.value}</Text>
        ) : (
          <Text key={i}>
            {part.prefix}
            <Text style={{ fontWeight: '600', color: t.primary }}>@{part.name}</Text>
          </Text>
        ),
      )}
    </Text>
  )
}
