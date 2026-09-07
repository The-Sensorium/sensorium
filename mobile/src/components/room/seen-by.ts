export interface SeenByMember {
  id: string
  display_name: string
  avatar_url: string | null
  read_at: string | null
}

export interface ReadMember {
  id: string
  display_name: string
  avatar_url: string | null
  read_at: string
}

interface PlainMember {
  id: string
  display_name: string
  avatar_url: string | null
}

interface DatedMessage {
  created_at: string
  author_id: string
}

export function seenByMembers(reads: readonly ReadMember[], excludeAuthorId: string): SeenByMember[] {
  return [...reads]
    .filter((r) => r.id !== excludeAuthorId)
    .map((r) => ({ id: r.id, display_name: r.display_name, avatar_url: r.avatar_url, read_at: r.read_at }))
    .sort((a, b) => (b.read_at ?? '').localeCompare(a.read_at ?? ''))
}

export function notSeenByMembers(
  message: DatedMessage,
  members: readonly PlainMember[],
  readUserIds: ReadonlySet<string>,
): SeenByMember[] {
  return members
    .filter((m) => m.id !== message.author_id && !readUserIds.has(m.id))
    .map((m) => ({ id: m.id, display_name: m.display_name, avatar_url: m.avatar_url, read_at: null }))
}
