import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { CornerUpLeft, ImagePlay, ImagePlus, Loader2, Send, X } from 'lucide-react'
import { useAuth } from '../app/auth-context'
import { Avatar } from './Avatar'
import { CommentItem } from './CommentItem'
import { GifPicker } from '../pages/cluster/room/GifPicker'
import {
  useClusterCommentLikes,
  useCreateComment,
  useToggleCommentLike,
  uploadPostImage,
  COMMENT_CONTENT_MAX,
  type PostComment,
} from '../features/posts'
import type { Gif } from '../features/gifs'
import { toErrorMessage } from '../lib/error'
import { isMutedAuthor, mutedIds, toggleRevealedId, useMyMutes } from '../features/moderation'
import { MutedHideBar, MutedPlaceholder } from './MutedPlaceholder'
import { cn } from '../lib/utils'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function CommentThread({
  clusterId,
  postId,
  comments,
  memberById,
  selfAvatar,
}: {
  clusterId: string
  postId: string
  comments: PostComment[]
  memberById: Map<string, { id: string; display_name: string; avatar_url: string | null }>
  selfAvatar: { display_name: string; avatar_url: string | null }
}) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [gif, setGif] = useState<Gif | null>(null)
  const [gifOpen, setGifOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const create = useCreateComment(clusterId)

  useEffect(() => {
    function dismiss() {
      setGifOpen(false)
    }
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [])

  const replyId = replyTo?.id
  useEffect(() => {
    if (replyId) {
      composerRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
      textareaRef.current?.focus?.({ preventScroll: true })
    }
  }, [replyId])

  function handleFile(f?: File) {
    if (!f) return
    setError(null)
    if (!ALLOWED_IMAGE_TYPES.has(f.type)) {
      setError('Only JPG, PNG, WebP and GIF images are supported.')
      return
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setError('Images must be 5 MB or smaller.')
      return
    }
    setGif(null)
    setFile(f)
  }

  async function handleComment() {
    const content = draft.trim()
    if ((!content && !file && !gif) || create.isPending) return
    setError(null)
    const parentCommentId =
      replyTo && comments.some((c) => c.id === replyTo.id) ? replyTo.id : undefined
    try {
      if (gif) {
        await create.mutateAsync({ postId, content: content || null, gifUrl: gif.url, parentCommentId })
      } else if (file) {
        const path = await uploadPostImage(clusterId, file)
        await create.mutateAsync({ postId, content: content || null, imageUrl: path, parentCommentId })
      } else {
        await create.mutateAsync({ postId, content: content || null, parentCommentId })
      }
      setDraft('')
      setFile(null)
      setGif(null)
      setReplyTo(null)
    } catch (e) {
      setError(toErrorMessage(e, 'Could not comment. Try again.'))
    }
  }

  const hasContent = Boolean(draft.trim() || file || gif)

  const myMutes = useMyMutes(true)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }
  const commentIds = comments.map((c) => c.id)
  const commentLikes = useClusterCommentLikes(clusterId, commentIds)
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

  const replyTargetExists = replyTo ? comments.some((c) => c.id === replyTo.id) : false
  const showTopComposer = !replyTo || !replyTargetExists

  // The reply target comes from this same list, so a miss is usually a
  // transient refetch gap rather than a deletion. Only cancel once the
  // target was seen in a loaded list and is now gone from a non-empty one.
  // handleComment already falls back to top-level when the target is absent,
  // so a missed notice is harmless.
  const seenReplyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!replyTo) {
      seenReplyRef.current = null
      return
    }
    if (comments.some((c) => c.id === replyTo.id)) {
      seenReplyRef.current = replyTo.id
      return
    }
    if (seenReplyRef.current === replyTo.id && comments.length > 0) {
      setReplyTo(null)
      setError('The comment you were replying to is no longer available. Posting as a top-level comment instead.')
    }
  }, [comments, replyTo])

  function renderComposer(variant: 'top' | 'inline') {
    return (
      <form
        ref={composerRef}
        className={
          variant === 'top'
            ? 'flex items-start gap-3 border-t border-outline-variant/60 pt-4'
            : 'flex items-start gap-3 pt-1'
        }
        onSubmit={(e) => {
          e.preventDefault()
          void handleComment()
        }}
      >
        <Avatar
          name={selfAvatar.display_name}
          src={selfAvatar.avatar_url}
          className="h-8 w-8"
          textClassName="text-sm"
        />
        <div className="min-w-0 flex-1">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-2xl border border-outline-variant/60 bg-surface px-3 py-2 text-xs">
              <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Replying to <span className="font-semibold text-on-surface">{replyTo.authorName}</span>
              </span>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={() => setReplyTo(null)}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          )}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={COMMENT_CONTENT_MAX}
              placeholder="Add a comment…"
              aria-label="Add a comment"
              className="w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-2.5 text-sm leading-5 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
            />
            {(file || gif) && (
              <div className="mt-1 flex items-center gap-2 text-xs text-on-surface-variant">
                {file ? (
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-3 py-1">
                    <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> {file.name}
                  </span>
                ) : gif ? (
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-3 py-1">
                    <ImagePlay className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> {gif.title || 'GIF'}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove media"
                  onClick={() => {
                    setFile(null)
                    setGif(null)
                  }}
                  className="grid h-5 w-5 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            )}
            {error && <p className="mt-1 text-xs text-error">{error}</p>}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="relative flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Attach image"
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors',
                  file
                    ? 'bg-primary-container/15 text-primary hover:bg-primary-container/25'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                )}
              >
                <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Image
              </button>
              <button
                type="button"
                aria-label="Add a GIF"
                aria-haspopup="dialog"
                aria-expanded={gifOpen}
                onClick={(e) => {
                  e.stopPropagation()
                  setGifOpen((o) => !o)
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors',
                  gif
                    ? 'bg-primary-container/15 text-primary hover:bg-primary-container/25'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                )}
              >
                <ImagePlay className="h-4 w-4" strokeWidth={1.5} aria-hidden /> GIF
              </button>
              {gifOpen && (
                <GifPicker
                  placement="bottom"
                  pending={create.isPending}
                  onSelect={(g) => {
                    setGif(g)
                    setFile(null)
                    setGifOpen(false)
                  }}
                />
              )}
            </div>
            <button
              type="submit"
              disabled={!hasContent || create.isPending}
              className="ml-auto inline-flex items-center gap-2 rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              )}
              Comment
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </form>
    )
  }

  return (
    <section className="mt-4 space-y-4">
      <h3 className="font-display text-sm font-semibold text-on-surface">
        Comments ({comments.length})
      </h3>

      {showTopComposer && renderComposer('top')}

      {myMutes.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : (
        <ul className="space-y-4">
          {top.map((tc) => {
            const thread = threads.get(tc.id) ?? []
            const tcMuted = isMutedAuthor(mutedSet, tc.author_id)
            const tcHidden = tcMuted && !revealed.has(tc.id)
            return (
              <li key={tc.id} className="space-y-3">
                {tcHidden ? (
                  <MutedPlaceholder
                    name={memberById.get(tc.author_id)?.display_name ?? 'Member'}
                    onToggle={() => toggleReveal(tc.id)}
                    kind="comment"
                  />
                ) : (
                  <CommentItem
                    comment={tc}
                    clusterId={clusterId}
                    author={memberById.get(tc.author_id)}
                    onReply={() => setReplyTo({ id: tc.id, authorName: authorNameOf(tc.id) })}
                    onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                    likeCount={likesByComment.get(tc.id)?.count ?? 0}
                    likedByMe={likesByComment.get(tc.id)?.mine ?? false}
                    replyCount={thread.length}
                    mutedBanner={
                      tcMuted ? (
                        <MutedHideBar
                          name={memberById.get(tc.author_id)?.display_name ?? 'Member'}
                          onToggle={() => toggleReveal(tc.id)}
                          kind="comment"
                        />
                      ) : undefined
                    }
                  />
                )}
                {replyTo?.id === tc.id && (
                  <div className="ml-11">{renderComposer('inline')}</div>
                )}
                {thread.length > 0 && (
                  <ul className="ml-11 space-y-3 border-l border-outline-variant/40 pl-4">
                    {thread.map((r) => {
                      const rMuted = isMutedAuthor(mutedSet, r.author_id)
                      const inline = replyTo?.id === r.id ? <li>{renderComposer('inline')}</li> : null
                      if (rMuted && !revealed.has(r.id)) {
                        return (
                          <Fragment key={r.id}>
                            <li>
                              <MutedPlaceholder
                                name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                                onToggle={() => toggleReveal(r.id)}
                                kind="comment"
                              />
                            </li>
                            {inline}
                          </Fragment>
                        )
                      }
                      return (
                        <Fragment key={r.id}>
                          <CommentItem
                            comment={r}
                            clusterId={clusterId}
                            author={memberById.get(r.author_id)}
                            repliedToName={
                              r.parent_comment_id === tc.id ? undefined : authorNameOf(r.parent_comment_id as string)
                            }
                            onReply={() => setReplyTo({ id: r.id, authorName: authorNameOf(r.id) })}
                            onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                            likeCount={likesByComment.get(r.id)?.count ?? 0}
                            likedByMe={likesByComment.get(r.id)?.mine ?? false}
                            mutedBanner={
                              rMuted ? (
                                <MutedHideBar
                                  name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                                  onToggle={() => toggleReveal(r.id)}
                                  kind="comment"
                                />
                              ) : undefined
                            }
                          />
                          {inline}
                        </Fragment>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
          {orphans.map((c) => {
            const cMuted = isMutedAuthor(mutedSet, c.author_id)
            const inlineComposer = replyTo?.id === c.id ? renderComposer('inline') : null
            if (cMuted && !revealed.has(c.id)) {
              return (
                <li key={c.id}>
                  <MutedPlaceholder
                    name={memberById.get(c.author_id)?.display_name ?? 'Member'}
                    onToggle={() => toggleReveal(c.id)}
                    kind="comment"
                  />
                  {inlineComposer && <div className="mt-3">{inlineComposer}</div>}
                </li>
              )
            }
            return (
              <Fragment key={c.id}>
                <CommentItem
                  comment={c}
                  clusterId={clusterId}
                  author={memberById.get(c.author_id)}
                  repliedToName={c.parent_comment_id ? authorNameOf(c.parent_comment_id) : undefined}
                  onReply={() => setReplyTo({ id: c.id, authorName: authorNameOf(c.id) })}
                  onLike={(id) => void toggleCommentLike.mutateAsync(id)}
                  likeCount={likesByComment.get(c.id)?.count ?? 0}
                  likedByMe={likesByComment.get(c.id)?.mine ?? false}
                  mutedBanner={
                    cMuted ? (
                      <MutedHideBar
                        name={memberById.get(c.author_id)?.display_name ?? 'Member'}
                        onToggle={() => toggleReveal(c.id)}
                        kind="comment"
                      />
                    ) : undefined
                  }
                />
                {inlineComposer && <li>{inlineComposer}</li>}
              </Fragment>
            )
          })}
        </ul>
      )}
    </section>
  )
}
