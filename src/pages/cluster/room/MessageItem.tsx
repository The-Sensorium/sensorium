import { Link } from 'react-router'
import { CornerUpLeft, Flag, Info, Loader2, MoreHorizontal, Pencil, Send, ShieldOff, Trash2, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Avatar } from '../../../components/Avatar'
import { DayDivider } from './DayDivider'
import { MessageImage } from './MessageImage'
import { MessageGif } from './MessageGif'
import { MentionText } from './MentionText'
import type { Message, Reaction } from '../../../features/cluster'
import type { MentionMember } from '../../../features/mentions'

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export function MessageItem({
  message,
  mine,
  author,
  reactions,
  myReactionKeys,
  members,
  clusterId,
  showDay,
  isEditing,
  editDraft,
  editPending,
  menuOpen,
  pickerOpen,
  replyParent,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onToggleMenu,
  onTogglePicker,
  onShowInfo,
  onEdit,
  onDelete,
  onReply,
  onToggleReaction,
  onReport,
}: {
  message: Message
  mine: boolean
  author: { id: string; display_name: string; avatar_url: string | null } | undefined
  reactions: Reaction[]
  myReactionKeys: ReadonlySet<string>
  members: MentionMember[]
  clusterId: string
  showDay: boolean
  isEditing: boolean
  editDraft: string
  editPending: boolean
  menuOpen: boolean
  pickerOpen: boolean
  replyParent: { authorName?: string; preview: string } | undefined
  onEditDraftChange(value: string): void
  onSaveEdit(): void
  onCancelEdit(): void
  onToggleMenu(): void
  onTogglePicker(): void
  onShowInfo(message: Message): void
  onEdit(message: Message): void
  onDelete(messageId: string): void
  onReply(message: Message): void
  onToggleReaction(messageId: string, emoji: string): void
  onReport(message: Message): void
}) {
  const grouped = new Map<string, number>()
  for (const r of reactions) grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1)
  const gifUrl = message.content?.startsWith('gif:') ? message.content.slice(4) : null

  return (
    <li>
      {showDay && <DayDivider iso={message.created_at} />}
      <div
        className={cn(
          'flex items-start gap-2 py-1',
          mine ? 'flex-row-reverse' : 'flex-row',
        )}
      >
        {author ? (
          <Link
            to={`/profile/${author.id}?cluster=${clusterId}`}
            title={author.display_name}
            className="mt-6 shrink-0"
          >
            <Avatar
              name={author.display_name}
              src={author.avatar_url}
              className="h-7 w-7"
              textClassName="text-xs"
            />
          </Link>
        ) : (
          <span title="Member" className="mt-6 shrink-0">
            <Avatar
              name="Member"
              className="h-7 w-7"
              textClassName="text-xs"
            />
          </span>
        )}
        <div className={cn('max-w-[78%] sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
          <p
            className={cn(
              'mb-0.5 flex items-baseline gap-2 text-xs',
              mine ? 'justify-end' : 'justify-start',
            )}
          >
            <span className="font-semibold text-on-surface-variant">
              {mine ? 'You' : author?.display_name ?? 'Member'}
            </span>
            <span className="text-on-surface-variant/60">
              {timeFormatter.format(new Date(message.created_at))}
            </span>
            <button
              type="button"
              aria-label="Message actions"
              onClick={(e) => {
                e.stopPropagation()
                onToggleMenu()
              }}
              className="grid h-6 w-6 place-items-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </button>
          </p>

          {menuOpen && (
            <div
              className="mb-1 flex w-max gap-1 rounded-xl border border-outline-variant/60 bg-surface p-1 shadow-soft"
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              {mine ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label="Info"
                    onClick={() => onShowInfo(message)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <Info className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                    <span className="hidden sm:inline">Info</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label="Edit"
                    onClick={() => onEdit(message)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label="Delete"
                    onClick={() => onDelete(message.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error-container/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  aria-label="Report"
                  onClick={() => onReport(message)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error-container/50"
                >
                  <Flag className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  <span className="hidden sm:inline">Report</span>
                </button>
              )}
            </div>
          )}

          <div
            className={
              isEditing
                ? 'rounded-2xl border border-outline-variant/60 bg-surface p-2'
                : cn(
                    'rounded-2xl bg-surface-container px-4 py-2.5 text-sm leading-relaxed text-on-surface shadow-soft',
                    'whitespace-pre-wrap break-words',
                    mine ? 'rounded-br-md' : 'rounded-bl-md',
                  )
            }
          >
            {!isEditing && message.reply_to_id && (
              <div className="mb-1.5 flex items-start gap-1.5 rounded-xl bg-surface-container/50 px-2.5 py-1.5 text-xs leading-tight">
                <CornerUpLeft
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-on-surface-variant"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <div className="min-w-0">
                  <span className="font-semibold text-on-surface-variant">
                    {replyParent?.authorName ?? 'Member'}
                  </span>{' '}
                  <span className="text-on-surface-variant/80">
                    {replyParent?.preview ?? 'message'}
                  </span>
                </div>
              </div>
            )}
            {isEditing ? (
              <div className="flex items-end gap-2">
                <textarea
                  aria-label="Edit message"
                  value={editDraft}
                  onChange={(e) => onEditDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      onSaveEdit()
                    }
                  }}
                  rows={2}
                  className="min-w-0 flex-1 resize-none rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                />
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="Save edit"
                    disabled={!editDraft.trim() || editPending}
                    onClick={onSaveEdit}
                    className="grid h-9 w-9 place-items-center rounded-full text-primary transition-colors hover:bg-primary-container/40 disabled:opacity-40"
                  >
                    {editPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel edit"
                    onClick={onCancelEdit}
                    className="grid h-9 w-9 place-items-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
              </div>
            ) : message.image_url ? (
              <>
                {message.moderation_status === 'approved' ? (
                  <MessageImage path={message.image_url} alt="Shared image" />
                ) : (
                  <span className="flex items-center gap-2 rounded-xl bg-surface-container/50 px-4 py-3 text-xs text-on-surface-variant">
                    <ShieldOff className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    This image was hidden by moderation.
                  </span>
                )}
                {message.content?.trim() ? (
                  <div className="mt-1.5">
                    <MentionText content={message.content} members={members} clusterId={clusterId} />
                  </div>
                ) : null}
              </>
            ) : gifUrl ? (
              <MessageGif src={gifUrl} />
            ) : (
              <MentionText
                content={message.content ?? ''}
                members={members}
                clusterId={clusterId}
              />
            )}
            {!isEditing && message.edited_at && (
              <span className="ml-1 text-xs opacity-70" aria-label="edited">
                (edited)
              </span>
            )}
          </div>

          <div
            className={cn(
              'mt-1 flex flex-wrap items-center gap-1',
              mine ? 'justify-end' : 'justify-start',
            )}
          >
            <button
              type="button"
              aria-label="Reply"
              onClick={() => onReply(message)}
              className="grid h-7 w-7 place-items-center rounded-full border border-outline-variant/60 bg-surface text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              <CornerUpLeft className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            </button>
            {[...grouped.entries()].map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React ${emoji}`}
                aria-pressed={myReactionKeys.has(`${message.id}:${emoji}`)}
                onClick={() => onToggleReaction(message.id, emoji)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-xs transition-colors',
                  myReactionKeys.has(`${message.id}:${emoji}`)
                    ? 'border-primary/50 bg-primary/10 text-on-surface'
                    : 'border-outline-variant/60 bg-surface text-on-surface-variant hover:bg-surface-container',
                )}
              >
                <span aria-hidden>{emoji}</span>
                <span>{count}</span>
              </button>
            ))}
            {pickerOpen ? (
              <div className="inline-flex items-center gap-1 rounded-pill border border-outline-variant/60 bg-surface px-2 py-1 shadow-soft" onClick={(e) => e.stopPropagation()}>
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`Add ${emoji}`}
                    onClick={() => {
                      onToggleReaction(message.id, emoji)
                      onTogglePicker()
                    }}
                    className="grid h-7 w-7 place-items-center rounded-full text-base transition-colors hover:bg-surface-container"
                  >
                    <span aria-hidden>{emoji}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                aria-label="Add reaction"
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePicker()
                }}
                className="grid h-7 w-7 place-items-center rounded-full border border-outline-variant/60 bg-surface text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <span aria-hidden>+</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
