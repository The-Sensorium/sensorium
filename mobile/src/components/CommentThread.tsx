import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'
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
  deepLinkCommentId,
  scrollRef,
  contentRef,
  onDeepLinkHandled,
}: {
  clusterId: string
  comments: PostComment[]
  memberById: Map<string, { id: string; display_name: string; avatar_url: string | null }>
  onReply(target: ReplyTarget): void
  deepLinkCommentId?: string | null
  scrollRef?: RefObject<KeyboardAwareScrollViewRef | null>
  contentRef?: RefObject<View | null>
  onDeepLinkHandled?: (commentId: string) => void
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
  const [highlightId, setHighlightId] = useState<string | null>(deepLinkCommentId ?? null)
  const [deepLinkMissing, setDeepLinkMissing] = useState(false)
  const measureRaf = useRef<number | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const targetRef = useRef<View>(null)
  // The scroll target is owned locally until the scroll is dispatched.
  // Clearing the route param (via onDeepLinkHandled) re-renders with
  // deepLinkCommentId = null, which detaches targetRef; holding the id here
  // keeps the measured view mounted until after measureInWindow runs.
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(deepLinkCommentId ?? null)
  const handledRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (deepLinkCommentId) {
      // A re-tap of an already-handled comment arrives as a fresh value
      // (the parent cleared it in between), so unmark it to fire again.
      handledRef.current.delete(deepLinkCommentId)
      setScrollTargetId(deepLinkCommentId)
      setHighlightId(deepLinkCommentId)
    }
  }, [deepLinkCommentId])

  useEffect(() => {
    return () => {
      if (measureRaf.current !== null) cancelAnimationFrame(measureRaf.current)
      if (retryTimer.current !== null) clearTimeout(retryTimer.current)
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    }
  }, [])

  // Notification deep link: scroll the target comment into view once loaded,
  // then flash the shared highlight ring. Each new value fires exactly once
  // even when this instance is reused across taps.
  useEffect(() => {
    if (!scrollTargetId || comments.length === 0) return
    if (handledRef.current.has(scrollTargetId)) return
    const pendingId = scrollTargetId
    const target = comments.find((c) => c.id === pendingId)
    function finish() {
      if (handledRef.current.has(pendingId)) return
      handledRef.current.add(pendingId)
      if (retryTimer.current !== null) {
        clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
      setScrollTargetId(null)
      onDeepLinkHandled?.(pendingId)
    }
    if (!target || target.deleted_at) {
      setDeepLinkMissing(true)
      setHighlightId(null)
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current)
        highlightTimer.current = null
      }
      finish()
      return
    }
    // A muted-hidden target still renders its placeholder (now measurable
    // via innerRef), so scroll to it like any other target.
    setDeepLinkMissing(false)
    setHighlightId(pendingId)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => {
      highlightTimer.current = null
      setHighlightId(null)
    }, 1600)
    // Measure on the next frame so the native views exist. measureInWindow
    // needs no ancestor handle (measureLayout's ancestor must be a native
    // element instance, which the keyboard-controller wrapper ref is not),
    // and window coords cancel out in the subtraction, yielding the target's
    // exact offset within the scroll content. Measurement failure must never
    // break navigation or spam warnings, so skip silently in that case.
    function attempt(lastTry: boolean) {
      try {
        const scroller = scrollRef?.current ?? null
        const nodeTarget = targetRef.current
        const content = contentRef?.current ?? null
        if (scroller && nodeTarget && content) {
          nodeTarget.measureInWindow((tx, ty) => {
            content.measureInWindow((cx, cy) => {
              scroller.scrollTo({ y: Math.max(0, ty - cy - 120), animated: true })
              finish()
            })
          })
          // Fallback: if the native callbacks never fire, don't hold the
          // target (and its ref) forever; clear it without scrolling.
          if (retryTimer.current !== null) clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(() => finish(), 1500)
          return
        }
      } catch {
        // Ignore measurement failures; navigation still completes.
      }
      if (lastTry) {
        finish()
        return
      }
      if (retryTimer.current !== null) clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(() => attempt(true), 350)
    }
    if (measureRaf.current !== null) cancelAnimationFrame(measureRaf.current)
    measureRaf.current = requestAnimationFrame(() => attempt(false))
    return () => {
      if (measureRaf.current !== null) cancelAnimationFrame(measureRaf.current)
      if (retryTimer.current !== null) clearTimeout(retryTimer.current)
    }
  }, [scrollTargetId, comments, scrollRef, contentRef, onDeepLinkHandled, mutedSet, revealed])
  const commentIds = comments.map((c) => c.id)
  const commentLikes = useClusterCommentLikes(clusterId)
  const toggleCommentLike = useToggleCommentLike(clusterId)

  // Comment likes are cached by cluster, not by comment set. When a new comment
  // arrives the ids grow but the query key doesn't, so refetch to pick up the
  // author's self-like instead of a stale 0 (mirrors PostsFeedPage).
  const commentIdsKey = commentIds.join(',')
  const prevCommentIdsKey = useRef(commentIdsKey)
  const refetchLikes = useRef(commentLikes.refetch)
  refetchLikes.current = commentLikes.refetch
  useEffect(() => {
    if (prevCommentIdsKey.current === commentIdsKey) return
    prevCommentIdsKey.current = commentIdsKey
    if (!commentIdsKey) return
    void refetchLikes.current()
  }, [commentIdsKey])

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
      {deepLinkMissing ? (
        <Text style={{ marginTop: 8, fontSize: 12, color: t.onSurfaceVariant }}>
          That comment is no longer available. Showing the post instead.
        </Text>
      ) : null}

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
                      highlighted={highlightId === tc.id}
                      innerRef={scrollTargetId === tc.id ? targetRef : undefined}
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
                        highlighted={highlightId === tc.id}
                        innerRef={scrollTargetId === tc.id ? targetRef : undefined}
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
                                highlighted={highlightId === r.id}
                                innerRef={scrollTargetId === r.id ? targetRef : undefined}
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
                              highlighted={highlightId === r.id}
                              innerRef={scrollTargetId === r.id ? targetRef : undefined}
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
                      highlighted={highlightId === c.id}
                      innerRef={scrollTargetId === c.id ? targetRef : undefined}
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
                    highlighted={highlightId === c.id}
                    innerRef={scrollTargetId === c.id ? targetRef : undefined}
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
