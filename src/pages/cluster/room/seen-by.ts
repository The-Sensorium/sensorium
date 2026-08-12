export interface SeenByMember {
  id: string
  display_name: string
  avatar_url: string | null
  read_at: string | null
}

/** A member profile carrying their immutable per-message read time. */
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

/** Members who read the message (author excluded), most recently read first. */
export function seenByMembers(reads: readonly ReadMember[], excludeAuthorId: string): SeenByMember[] {
  return [...reads]
    .filter((r) => r.id !== excludeAuthorId)
    .map((r) => ({ id: r.id, display_name: r.display_name, avatar_url: r.avatar_url, read_at: r.read_at }))
    .sort((a, b) => (b.read_at ?? '').localeCompare(a.read_at ?? ''))
}

/** Active members (excluding the author) who have not read the message yet. */
export function notSeenByMembers(
  message: DatedMessage,
  members: readonly PlainMember[],
  readUserIds: ReadonlySet<string>,
): SeenByMember[] {
  return members
    .filter((m) => m.id !== message.author_id && !readUserIds.has(m.id))
    .map((m) => ({ id: m.id, display_name: m.display_name, avatar_url: m.avatar_url, read_at: null }))
}
