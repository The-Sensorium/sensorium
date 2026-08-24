import { useState } from 'react'
import { Link } from 'react-router'
import { Check, Copy, Flag, Heart, Loader2, MessageSquare, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../app/auth-context'
import { Avatar } from './Avatar'
import { PostMedia } from './PostMedia'
import { Modal } from './Modal'
import { ReportModal } from './ReportModal'
import { useDeletePost, useEditPost, type Post } from '../features/posts'
import { toErrorMessage } from '../lib/error'

const timeAgo = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function PostCard({
  post,
  clusterId,
  author,
  likeCount,
  likedByMe,
  commentCount,
  onLike,
}: {
  post: Post
  clusterId: string
  author: { id: string; display_name: string; avatar_url: string | null } | undefined
  likeCount: number
  likedByMe: boolean
  commentCount: number
  onLike: (postId: string) => void
}) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const isMine = post.author_id === userId

  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.content ?? '')
  const [titleDraft, setTitleDraft] = useState(post.title ?? '')
  const [editError, setEditError] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const edit = useEditPost(clusterId)
  const del = useDeletePost(clusterId)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/posts/${post.id}`)
    } catch {
      // Clipboard may be unavailable (e.g. denied permission); still give feedback.
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleEdit() {
    const content = draft.trim()
    if (!content || edit.isPending) return
    setEditError(null)
    try {
      await edit.mutateAsync({ postId: post.id, content, title: titleDraft.trim() || null })
      setEditing(false)
    } catch (e) {
      setEditError(toErrorMessage(e, 'Could not edit your post. Try again.'))
    }
  }

  return (
    <article className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <Link to={`/posts/${post.id}`} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Avatar
            name={author?.display_name ?? 'Member'}
            src={author?.avatar_url}
            className="h-5 w-5"
            textClassName="text-[10px]"
          />
          <span className="text-sm font-medium text-on-surface">{author?.display_name ?? 'Member'}</span>
          {isMine && <span className="text-xs text-on-surface-variant">(you)</span>}
          <span className="text-xs text-on-surface-variant">· {timeAgo.format(new Date(post.created_at))}</span>
          {post.edited_at && <span className="text-xs text-on-surface-variant">· edited</span>}
        </div>
        {post.title && (
          <h3 className="mt-2 font-display text-base font-semibold leading-tight text-on-surface">
            {post.title}
          </h3>
        )}
        {post.content && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-on-surface">{post.content}</p>
        )}
        <PostMedia imageUrl={post.image_url} gifUrl={post.gif_url} alt={post.content ?? 'Post media'} />
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          aria-pressed={likedByMe}
          onClick={() => onLike(post.id)}
          className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-primary"
          style={{ color: likedByMe ? 'var(--color-error)' : undefined }}
        >
          <Heart
            className="h-4 w-4"
            strokeWidth={1.5}
            aria-hidden
            {...(likedByMe ? { fill: 'currentcolor' } : {})}
          />
          {likeCount}
        </button>

        <Link
          to={`/posts/${post.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {commentCount}
        </Link>

        <div className="relative ml-auto">
          <button
            type="button"
            aria-label="Post actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="grid h-8 w-8 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <MoreVertical className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close post actions"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
                tabIndex={-1}
              />
              <div
                role="menu"
                aria-label="Post actions"
                className="absolute right-0 top-full z-20 mt-1 flex w-40 flex-col gap-1 rounded-2xl border border-outline-variant/60 bg-surface p-1 shadow-lift"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleCopy()}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  )}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                {isMine ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setEditing(true)
                        setMenuOpen(false)
                      }}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Edit
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        void del.mutateAsync(post.id)
                      }}
                      disabled={del.isPending}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-error transition-colors hover:bg-error/10 disabled:opacity-60"
                    >
                      {del.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                      )}
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setReportOpen(true)
                      setMenuOpen(false)
                    }}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <Flag className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Report
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit post">
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void handleEdit()
          }}
        >
          <label htmlFor="edit-post-title" className="sr-only">
            Edit post title
          </label>
          <input
            id="edit-post-title"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            maxLength={200}
            placeholder="Post title (optional)"
            className="w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-2.5 text-sm font-semibold text-on-surface outline-none transition-colors placeholder:font-normal placeholder:text-on-surface-variant/60 focus:border-primary"
          />
          <label htmlFor="edit-post" className="sr-only">
            Edit post
          </label>
          <textarea
            id="edit-post"
            rows={4}
            maxLength={2000}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-sm leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
          />
          {editError && <p className="text-xs text-error">{editError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-pill px-4 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!draft.trim() || edit.isPending}
              className="rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {edit.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {author && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          clusterId={clusterId}
          target={{ id: author.id, name: author.display_name }}
          contentTarget={{ kind: 'post', id: post.id }}
        />
      )}
    </article>
  )
}
