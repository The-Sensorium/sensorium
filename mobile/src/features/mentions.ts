// Mention detection shared between the chat composer (autocomplete + rendering)
// and the message timeline. The rule mirrors the backend's `send_message`:
// a member is mentioned when a word-boundary `@` is immediately followed by
// their full display name (case-insensitive), itself followed by a non word
// char or end of string. Names are matched longest-first so a prefix name
// never shadows a longer display name. The broadcast token `@everyone`
// follows the same boundary rule and wins over a member literally named
// `Everyone`.

export interface MentionMember {
  id: string
  display_name: string
  avatar_url?: string | null
}

export type MentionPart =
  | { type: 'text'; value: string }
  | { type: 'mention'; prefix: string; name: string; id: string }
  | { type: 'everyone'; prefix: string; name: string }

export const EVERYONE_NAME = 'everyone'

const WORD = /[a-z0-9_]/i
const EVERYONE_PATTERN = /(^|[^a-z0-9_])@(everyone)(?=$|[^a-z0-9_])/gi

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface MemberName {
  id: string
  lower: string
  display: string
}

/** Split a broadcast-free segment into plain text and member mention chips. */
function parseMemberParts(segment: string, names: MemberName[]): MentionPart[] {
  if (!segment) return []
  if (names.length === 0) return [{ type: 'text', value: segment }]
  const pattern = new RegExp(
    '(^|[^a-z0-9_])@(' + names.map((n) => escapeRegExp(n.display)).join('|') + ')(?=$|[^a-z0-9_])',
    'gi',
  )
  const parts: MentionPart[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(segment)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: segment.slice(last, match.index) })
    const name = match[2]
    const member = names.find((n) => n.lower === name.toLowerCase())
    parts.push(
      member
        ? { type: 'mention', prefix: match[1] ?? '', name, id: member.id }
        : { type: 'text', value: match[0] },
    )
    last = match.index + match[0].length
  }
  if (last < segment.length) parts.push({ type: 'text', value: segment.slice(last) })
  return parts
}

/** Split message content into plain text, member mention chips, and broadcast chips. */
export function parseMentions(content: string, members: MentionMember[]): MentionPart[] {
  if (!content) return [{ type: 'text', value: content ?? '' }]
  const names = members
    .map((m) => ({ id: m.id, lower: m.display_name.toLowerCase(), display: m.display_name }))
    .sort((a, b) => b.display.length - a.display.length)

  const parts: MentionPart[] = []
  let last = 0
  let match: RegExpExecArray | null
  EVERYONE_PATTERN.lastIndex = 0
  while ((match = EVERYONE_PATTERN.exec(content)) !== null) {
    if (match.index > last) parts.push(...parseMemberParts(content.slice(last, match.index), names))
    parts.push({ type: 'everyone', prefix: match[1] ?? '', name: match[2] })
    last = match.index + match[0].length
  }
  if (last < content.length) parts.push(...parseMemberParts(content.slice(last), names))
  return parts.length > 0 ? parts : [{ type: 'text', value: content }]
}

/**
 * Find the `@Query` mention being typed at `caret`. Returns the token start and
 * the query text (empty for a bare `@`), or null when the caret is not inside a
 * mention token.
 */
export function parseMentionQuery(
  draft: string,
  caret: number,
): { start: number; end: number; query: string } | null {
  const before = draft.slice(0, caret)
  let at = before.lastIndexOf('@')
  while (at !== -1) {
    const prev = at === 0 ? '' : before[at - 1]
    if (prev === '' || !WORD.test(prev)) {
      const token = before.slice(at + 1)
      if (!token.includes(' ')) return { start: at, end: caret, query: token }
    }
    // lastIndexOf with a negative fromIndex wraps to 0 and would re-report the
    // same `@`, so stop once the search position reaches the start of the text.
    if (at === 0) break
    at = before.lastIndexOf('@', at - 1)
  }
  return null
}

/** True when the query is empty or a case-insensitive prefix of `everyone`. */
export function matchesEveryone(query: string): boolean {
  return EVERYONE_NAME.startsWith(query.trim().toLowerCase())
}

/** Members matching the mention query, prefix matches first, limited for the dropdown. */
export function filterMentionCandidates(
  query: string,
  members: MentionMember[],
  excludeId: string,
): MentionMember[] {
  const q = query.trim().toLowerCase()
  return members
    .filter((m) => m.id !== excludeId)
    .filter((m) => m.display_name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.display_name.toLowerCase().startsWith(q)
      const bStarts = b.display_name.toLowerCase().startsWith(q)
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      return a.display_name.localeCompare(b.display_name)
    })
    .slice(0, 8)
}
