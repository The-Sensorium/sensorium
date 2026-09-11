import { useState } from 'react'
import { History, Loader2, Pencil, Trash2 } from 'lucide-react'
import {
  formatError,
  useAddCaseNote,
  useDeleteCaseNote,
  useEditCaseNote,
  type CaseTimelineEntry,
} from '../../../features/admin-moderation'
import { timeAgo } from '../../../features/notifications'

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ')
}

export function CaseTimeline({
  reportId,
  entries,
  isLoading,
  isError,
  onRetry,
  myUserId,
  isAdmin,
  canNote,
}: {
  reportId: string
  entries: CaseTimelineEntry[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  myUserId: string | null
  isAdmin: boolean
  canNote: boolean
}) {
  const addNote = useAddCaseNote()
  const editNote = useEditCaseNote()
  const deleteNote = useDeleteCaseNote()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The note_added audit echo duplicates the note row itself, and claim/release
  // reasons repeat the action name, so both are folded away for readability.
  const visibleEntries = entries.filter((entry) => !(entry.kind === 'action' && entry.action === 'note_added'))

  async function submitNote() {
    if (!draft.trim()) return
    setError(null)
    try {
      await addNote.mutateAsync({ p_report_id: reportId, p_note: draft.trim() })
      setDraft('')
    } catch (e) {
      setError(formatError(e))
    }
  }

  async function submitEdit(noteId: string) {
    if (!editDraft.trim()) return
    setError(null)
    try {
      await editNote.mutateAsync({ p_note_id: noteId, p_note: editDraft.trim() })
      setEditingId(null)
      setEditDraft('')
    } catch (e) {
      setError(formatError(e))
    }
  }

  async function removeNote(noteId: string) {
    setError(null)
    try {
      await deleteNote.mutateAsync({ p_note_id: noteId })
    } catch (e) {
      setError(formatError(e))
    }
  }

  return (
    <section className="rounded-lg border border-outline-variant/60 bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
        <History className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden />
        Case timeline
      </h2>
      {error && <p role="alert" className="mt-3 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}

      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-md border border-error/30 bg-error/10 p-4 text-center">
          <p className="text-sm font-semibold text-error">Couldn’t load the timeline.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-pill bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Try Again
          </button>
        </div>
      ) : visibleEntries.length === 0 ? (
        <p className="mt-3 rounded-md bg-surface-container/60 p-4 text-sm text-on-surface-variant">
          No activity yet. Notes and actions on this case will appear here.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {visibleEntries.map((entry) => {
            const isNote = entry.kind === 'note'
            const canManageNote = isNote && (entry.actor_id === myUserId || isAdmin)
            const edited =
              isNote &&
              entry.metadata != null &&
              typeof entry.metadata === 'object' &&
              'edited_at' in (entry.metadata as Record<string, unknown>) &&
              (entry.metadata as Record<string, unknown>).edited_at != null
            const bodyRepeatsAction =
              !isNote && entry.body.trim().toLowerCase() === actionLabel(entry.action).toLowerCase()
            return (
              <li
                key={`${entry.kind}-${entry.entry_id}`}
                data-e2e={isNote ? 'case-note-row' : 'case-timeline-row'}
                className="rounded-md bg-surface-container/60 p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-semibold capitalize text-on-surface">
                    {isNote ? 'Staff note' : actionLabel(entry.action)}
                    <span className="ml-2 font-normal normal-case text-on-surface-variant">
                      by {entry.actor_display_name ?? 'Unknown'}
                    </span>
                  </p>
                  <span className="shrink-0 text-[11px] text-on-surface-variant">{timeAgo(entry.created_at)}</span>
                </div>
                {isNote && editingId === entry.entry_id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      aria-label="Edit note"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      maxLength={2000}
                      rows={3}
                      className="w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null)
                          setEditDraft('')
                        }}
                        className="rounded-pill px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitEdit(entry.entry_id)}
                        disabled={editNote.isPending || !editDraft.trim()}
                        className="rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary disabled:opacity-40"
                      >
                        Save note
                      </button>
                    </div>
                  </div>
                ) : bodyRepeatsAction ? null : (
                  <p className="mt-1 text-sm leading-6 text-on-surface">
                    {entry.body}
                    {edited && <span className="ml-2 text-[11px] text-on-surface-variant">(edited)</span>}
                  </p>
                )}
                {canManageNote && editingId !== entry.entry_id && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(entry.entry_id)
                        setEditDraft(entry.body)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                      Edit
                    </button>
                    {confirmingDeleteId === entry.entry_id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingDeleteId(null)
                            void removeNote(entry.entry_id)
                          }}
                          disabled={deleteNote.isPending}
                          className="inline-flex items-center gap-1.5 rounded-md border border-error/40 bg-error px-3 py-1.5 text-xs font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(null)}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(entry.entry_id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {canNote && (
        <div className="mt-4 border-t border-outline-variant/50 pt-4">
          <label className="block text-sm font-semibold text-on-surface" htmlFor="case-note-draft">
            Add an internal note
            <textarea
              id="case-note-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Staff-only context, handoff, or rationale…"
              maxLength={2000}
              rows={3}
              data-e2e="case-note-draft"
              className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
          </label>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void submitNote()}
              disabled={addNote.isPending || !draft.trim()}
              data-e2e="case-note-save"
              className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-40"
            >
              {addNote.isPending ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
