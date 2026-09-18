import { Fragment, useMemo, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useAuth } from '../auth-context'
import { CommentItem } from './CommentItem'
import {
  useClusterCommentLikes,
  useToggleCommentLike,
  type PostComment,
} from '../features/posts'
import { isMutedAuthor, mutedIds, toggleRevealedId, useMyMutes } from '../features/moderation'
import { MutedHideBar, MutedPlaceholder } from './MutedPlaceholder'
import { useTheme } from '../lib/use-theme'
import type { ReplyTarget } from './comment-helpers'

export function CommentThread({
  clusterId,
  comments,
  memberById,
  onReply,
}: {
  clusterId: string
  comments: PostComment[]
  memberById: Map<string, { id: string; display_name: string; avatar_url: string | null }>
  onReply(target: ReplyTarget): void
}) {
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const myMutes = useMyMutes(true)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }
  const commentIds = comments.map((c) => c.id)
  const commentLikes = useClusterCommentLikes(clusterId, commentIds)
  const toggleCommentLike = useToggleCommentLike(clusterId)

  const byId = new Map(comments.map((c) => [c.id, c]))
  const top: PostComment[] = []
  const topIds = new Set<string>()
  for (const c of comments) {
    if (!c.parent_comment_id) {
      top.push(c)
      topIds.add(c.id)
    }
  }
  const rootOf = (c: PostComment): PostComment | null => {
    let cur = c
    while (cur.parent_comment_id) {
      const parent = byId.get(cur.parent_comment_id)
      if (!parent) return null
      cur = parent
    }
    return cur
  }
  const threads = new Map<string, PostComment[]>()
  const orphans: PostComment[] = []
  for (const c of comments) {
    if (!c.parent_comment_id) continue
    const root = rootOf(c)
    if (root && topIds.has(root.id)) {
      const arr = threads.get(root.id) ?? []
      arr.push(c)
      threads.set(root.id, arr)
    } else {
      orphans.push(c)
    }
  }
  const authorNameOf = (commentId: string) => {
    const c = byId.get(commentId)
    return c ? (memberById.get(c.author_id)?.display_name ?? 'Member') : 'Member'
  }

  const likesByComment = new Map<string, { count: number; mine: boolean }>()
  for (const l of commentLikes.data ?? []) {
    const entry = likesByComment.get(l.comment_id) ?? { count: 0, mine: false }
    entry.count += 1
    if (l.user_id === userId) entry.mine = true
    likesByComment.set(l.comment_id, entry)
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
        Comments ({comments.length})
      </Text>

      <View style={{ marginTop: 16, gap: 16 }}>
        {myMutes.isLoading ? (
          <ActivityIndicator size="small" color={t.primary} />
        ) : (
          <>
            {top.map((tc) => {
              const thread = threads.get(tc.id) ?? []
              const tcMuted = isMutedAuthor(mutedSet, tc.author_id)
              const tcHidden = tcMuted && !revealed.has(tc.id)
              return (
                <View key={tc.id} style={{ gap: 12 }}>
                  {tcHidden ? (
                    <MutedPlaceholder
                      name={memberById.get(tc.author_id)?.display_name ?? 'Member'}
                      onToggle={() => toggleReveal(tc.id)}
                      kind="comment"
                    />
                  ) : (
                    <View style={{ gap: 8 }}>
                      {tcMuted ? (
                        <MutedHideBar
                          name={memberById.get(tc.author_id)?.display_name ?? 'Member'}
                          onToggle={() => toggleReveal(tc.id)}
                          kind="comment"
                        />
                      ) : null}
                      <CommentItem
                        comment={tc}
                        clusterId={clusterId}
                        author={memberById.get(tc.author_id)}
                        onReply={() => onReply({ id: tc.id, authorName: authorNameOf(tc.id) })}
                        onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                        likeCount={likesByComment.get(tc.id)?.count ?? 0}
                        likedByMe={likesByComment.get(tc.id)?.mine ?? false}
                        replyCount={thread.length}
                      />
                    </View>
                  )}
                  {thread.length > 0 ? (
                    <View style={{ marginLeft: 44, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: t.outlineVariant, gap: 12 }}>
                      {thread.map((r) => {
                        const rMuted = isMutedAuthor(mutedSet, r.author_id)
                        if (rMuted && !revealed.has(r.id)) {
                          return (
                            <Fragment key={r.id}>
                              <MutedPlaceholder
                                name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                                onToggle={() => toggleReveal(r.id)}
                                kind="comment"
                              />
                            </Fragment>
                          )
                        }
                        return (
                          <View key={r.id} style={{ gap: 8 }}>
                            {rMuted ? (
                              <MutedHideBar
                                name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                                onToggle={() => toggleReveal(r.id)}
                                kind="comment"
                              />
                            ) : null}
                            <CommentItem
                              comment={r}
                              clusterId={clusterId}
                              author={memberById.get(r.author_id)}
                              repliedToName={r.parent_comment_id === tc.id ? undefined : authorNameOf(r.parent_comment_id as string)}
                              onReply={() => onReply({ id: r.id, authorName: authorNameOf(r.id) })}
                              onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                              likeCount={likesByComment.get(r.id)?.count ?? 0}
                              likedByMe={likesByComment.get(r.id)?.mine ?? false}
                            />
                          </View>
                        )
                      })}
                    </View>
                  ) : null}
                </View>
              )
            })}
            {orphans.map((c) => {
              const cMuted = isMutedAuthor(mutedSet, c.author_id)
              if (cMuted && !revealed.has(c.id)) {
                return (
                  <View key={c.id} style={{ gap: 8 }}>
                    <MutedPlaceholder
                      name={memberById.get(c.author_id)?.display_name ?? 'Member'}
                      onToggle={() => toggleReveal(c.id)}
                      kind="comment"
                    />
                  </View>
                )
              }
              return (
                <View key={c.id} style={{ gap: 8 }}>
                  {cMuted ? (
                    <MutedHideBar
                      name={memberById.get(c.author_id)?.display_name ?? 'Member'}
                      onToggle={() => toggleReveal(c.id)}
                      kind="comment"
                    />
                  ) : null}
                  <CommentItem
                    comment={c}
                    clusterId={clusterId}
                    author={memberById.get(c.author_id)}
                    repliedToName={c.parent_comment_id ? authorNameOf(c.parent_comment_id) : undefined}
                    onReply={() => onReply({ id: c.id, authorName: authorNameOf(c.id) })}
                    onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                    likeCount={likesByComment.get(c.id)?.count ?? 0}
                    likedByMe={likesByComment.get(c.id)?.mine ?? false}
                  />
                </View>
              )
            })}
          </>
        )}
      </View>
    </View>
  )
}
