export interface SeenByMember {
  id: string
  display_name: string
  avatar_url: string | null
  read_at: string | null
}

interface ReadMember {
  id: string
  display_name: string
  avatar_url: string | null
  last_read_message_at: string
}

interface DatedMessage {
  created_at: string
  author_id: string
}

/** Active members (excluding the author) whose read watermark passed the message,
 * most recently read first. */
export function seenByMembers(message: DatedMessage, members: readonly ReadMember[]): SeenByMember[] {
  return members
    .filter((m) => m.id !== message.author_id && m.last_read_message_at >= message.created_at)
    .map((m) => ({ id: m.id, display_name: m.display_name, avatar_url: m.avatar_url, read_at: m.last_read_message_at }))
    .sort((a, b) => (b.read_at ?? '').localeCompare(a.read_at ?? ''))
}

/** Active members (excluding the author) who have not read up to the message yet. */
export function notSeenByMembers(message: DatedMessage, members: readonly ReadMember[]): SeenByMember[] {
  return members
    .filter((m) => m.id !== message.author_id && m.last_read_message_at < message.created_at)
    .map((m) => ({ id: m.id, display_name: m.display_name, avatar_url: m.avatar_url, read_at: null }))
}
