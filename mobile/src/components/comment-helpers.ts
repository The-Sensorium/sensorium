export interface ReplyTarget {
  id: string
  authorName: string
}

export function resolveParentCommentId(
  comments: { id: string }[],
  replyTo: { id: string } | null,
): string | undefined {
  return replyTo && comments.some((c) => c.id === replyTo.id) ? replyTo.id : undefined
}
