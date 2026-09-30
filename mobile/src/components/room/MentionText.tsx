import { Text } from 'react-native'
import { parseMentions, type MentionMember } from '../../features/mentions'
import { LinkifiedText } from '../LinkifiedText'
import { useTheme } from '../../lib/use-theme'

export function MentionText({ content, members, mine = false }: { content: string; members: MentionMember[]; mine?: boolean }) {
  const t = useTheme()
  const parts = parseMentions(content, members)
  return (
    <Text style={{ fontSize: 16, lineHeight: 24, color: mine ? t.onPrimary : t.onSurface }}>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <LinkifiedText key={i} text={part.value} fontSize={16} lineHeight={24} color={mine ? t.onPrimary : undefined} linkColor={mine ? t.onPrimary : undefined} />
        ) : part.type === 'everyone' ? (
          // Broadcast chip: styled like a mention but never a profile link.
          <Text key={i}>
            {part.prefix}
            <Text style={{ fontWeight: '600', color: mine ? t.onPrimary : t.primary }}>@{part.name}</Text>
          </Text>
        ) : (
          <Text key={i}>
            {part.prefix}
            <Text style={{ fontWeight: '600', color: mine ? t.onPrimary : t.primary }}>@{part.name}</Text>
          </Text>
        ),
      )}
    </Text>
  )
}
