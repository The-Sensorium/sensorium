import { Fragment, useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, ShieldCheck, UserCog, X } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { Avatar } from '../../components/Avatar'
import { Modal } from '../../components/Modal'
import {
  type AccountSearchRow,
  type PlatformRolePageRow,
  formatError,
  PLATFORM_ROLE_LABELS,
  useAccountSearch,
  useGrantRole,
  useRevokeRole,
  useRoleAssignments,
  type PlatformRole,
} from '../../features/admin-moderation'

const PAGE_SIZE = 25

export function ModerationRolesPage() {
  useDocumentTitle('Role management')
  const revoke = useRevokeRole()
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<PlatformRole | 'all'>('all')
  const [includeRevoked, setIncludeRevoked] = useState(false)
  const [page, setPage] = useState(1)
  const [grantOpen, setGrantOpen] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<{ row: PlatformRolePageRow; reason: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const assignments = useRoleAssignments({ search, role: roleFilter, includeRevoked, page, pageSize: PAGE_SIZE })

  const rows = assignments.data ?? []
  const total = assignments.data?.[0]?.total_count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = search.trim().length > 0 || roleFilter !== 'all' || includeRevoked

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  useEffect(() => {
    if (assignments.data?.length && page > pageCount) setPage(pageCount)
  }, [page, pageCount, assignments.data])

  async function doRevoke() {
    if (!pendingRevoke) return
    const { row, reason } = pendingRevoke
    setError(null)
    setSuccess(null)
    try {
      await revoke.mutateAsync({ p_user_id: row.user_id, p_role: row.role, p_reason: reason.trim() })
      setPendingRevoke(null)
      setSuccess(`${PLATFORM_ROLE_LABELS[row.role]} role revoked from ${row.display_name || row.email}.`)
    } catch (e) {
      setError(formatError(e))
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Role management</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Assign moderator and admin roles. Changes are audited.</p>
        </div>
        <button
          type="button"
          onClick={() => setGrantOpen(true)}
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          <UserCog className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Grant role
        </button>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}
      {success && <p role="status" className="rounded-2xl border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{success}</p>}

      <section aria-label="Role assignment filters" className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 basis-56 text-xs font-semibold text-on-surface">
            Search
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by name, email, or reason"
              autoComplete="off"
              className="mt-1.5 block w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block w-40 text-xs font-semibold text-on-surface">
            Role
            <span className="relative mt-1.5 block">
              <select
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value as PlatformRole | 'all')
                  setPage(1)
                }}
                className="w-full appearance-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 pr-10 text-sm font-normal text-on-surface focus:border-primary focus:outline-none"
              >
                <option value="all">All roles</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
            </span>
          </label>
          <label className="mb-2.5 inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-on-surface">
            <input
              type="checkbox"
              checked={includeRevoked}
              onChange={(event) => {
                setIncludeRevoked(event.target.checked)
                setPage(1)
              }}
              className="h-4 w-4 accent-primary"
            />
            Include revoked
          </label>
        </div>
      </section>

      {assignments.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : assignments.isError ? (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-10 text-center">
          <p className="text-sm font-semibold text-error">Couldn’t load role assignments.</p>
          <button
            type="button"
            onClick={() => void assignments.refetch()}
            className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Try Again
          </button>
        </div>
      ) : total === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <ShieldCheck className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">
            {hasFilters ? 'No role assignments match these filters.' : includeRevoked ? 'There are no platform roles yet.' : 'No active platform roles.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
            <span>{total} assignment{total === 1 ? '' : 's'}</span>
            {pageCount > 1 && <span>Page {page} of {pageCount}</span>}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface shadow-soft md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-separate text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    <th className="border-b border-outline-variant/60 px-4 py-3">Account</th>
                    <th className="border-b border-outline-variant/60 px-4 py-3">Role</th>
                    <th className="border-b border-outline-variant/60 px-4 py-3">Granted</th>
                    <th className="border-b border-outline-variant/60 px-4 py-3">Reason</th>
                    <th className="border-b border-outline-variant/60 px-4 py-3">Status</th>
                    <th className="border-b border-outline-variant/60 px-4 py-3" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr>
                        <td className="max-w-56 border-b border-outline-variant/40 px-4 py-3 align-middle">
                          <div className="flex items-center gap-3">
                            <Avatar name={row.display_name || '?'} src={null} className="h-9 w-9 text-sm" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-on-surface">{row.display_name || row.email || 'Deleted account'}</p>
                              <p className="truncate text-xs text-on-surface-variant">{row.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-outline-variant/40 px-4 py-3 align-middle">
                          <span className="inline-flex rounded-full bg-primary-container/20 px-2.5 py-1 text-xs font-semibold text-primary">
                            {PLATFORM_ROLE_LABELS[row.role]}
                          </span>
                        </td>
                        <td className="border-b border-outline-variant/40 px-4 py-3 align-middle text-on-surface-variant">
                          {new Date(row.granted_at).toLocaleDateString()}
                        </td>
                        <td className="max-w-56 border-b border-outline-variant/40 px-4 py-3 align-middle">
                          <p className="truncate text-on-surface-variant" title={row.grant_reason}>{row.grant_reason}</p>
                        </td>
                        <td className="border-b border-outline-variant/40 px-4 py-3 align-middle">
                          {!row.user_id ? (
                            <span className="inline-flex rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">Deleted</span>
                          ) : row.revoked_at ? (
                            <span className="inline-flex rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">Revoked</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-primary-container/20 px-2.5 py-1 text-xs font-semibold text-primary">Active</span>
                          )}
                        </td>
                        <td className="border-b border-outline-variant/40 px-4 py-3 text-right align-middle">
                          {row.user_id && !row.revoked_at && (
                            <button
                              type="button"
                              onClick={() => setPendingRevoke({ row, reason: '' })}
                              disabled={revoke.isPending}
                              className="rounded-pill border border-error/40 px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:opacity-40"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                      {pendingRevoke?.row.id === row.id && (
                        <tr>
                          <td colSpan={6} className="border-b border-outline-variant/40 px-4 py-3">
                            <div className="rounded-xl border border-error/30 bg-error/5 p-3">
                              <p className="text-sm font-semibold text-on-surface">
                                Revoke {PLATFORM_ROLE_LABELS[row.role]} from {row.display_name || row.email}?
                              </p>
                              <p className="mt-1 text-xs text-on-surface-variant">This change is recorded in the audit log.</p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <input
                                  value={pendingRevoke.reason}
                                  onChange={(event) => setPendingRevoke({ row, reason: event.target.value })}
                                  placeholder="Reason for revoking (required)"
                                  maxLength={500}
                                  className="min-w-0 flex-1 basis-52 rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => setPendingRevoke(null)}
                                  className="rounded-pill px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void doRevoke()}
                                  disabled={revoke.isPending || !pendingRevoke.reason.trim()}
                                  className="rounded-pill bg-error px-3 py-1.5 text-xs font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-40"
                                >
                                  Confirm revoke
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <div className="flex items-start gap-3 rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft">
                  <Avatar name={row.display_name || '?'} src={null} className="h-10 w-10 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{row.display_name || row.email || 'Deleted account'}</p>
                      <span className="shrink-0 rounded-full bg-primary-container/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {PLATFORM_ROLE_LABELS[row.role]}
                      </span>
                    </div>
                    <p className="truncate text-xs text-on-surface-variant">{row.email}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Granted {new Date(row.granted_at).toLocaleDateString()}
                      {!row.user_id ? ' · Deleted' : row.revoked_at ? ' · Revoked' : ''}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-on-surface-variant" title={row.grant_reason}>{row.grant_reason}</p>
                  </div>
                  {row.user_id && !row.revoked_at && (
                    <button
                      type="button"
                      onClick={() => setPendingRevoke({ row, reason: '' })}
                      disabled={revoke.isPending}
                      className="shrink-0 rounded-pill border border-error/40 px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  )}
                </div>
                {pendingRevoke?.row.id === row.id && (
                  <div className="mt-2 rounded-xl border border-error/30 bg-error/5 p-3">
                    <p className="text-sm font-semibold text-on-surface">
                      Revoke {PLATFORM_ROLE_LABELS[row.role]} from {row.display_name || row.email}?
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">This change is recorded in the audit log.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={pendingRevoke.reason}
                        onChange={(event) => setPendingRevoke({ row, reason: event.target.value })}
                        placeholder="Reason for revoking (required)"
                        maxLength={500}
                        className="min-w-0 flex-1 basis-52 rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setPendingRevoke(null)}
                        className="rounded-pill px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void doRevoke()}
                        disabled={revoke.isPending || !pendingRevoke.reason.trim()}
                        className="rounded-pill bg-error px-3 py-1.5 text-xs font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-40"
                      >
                        Confirm revoke
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 rounded-pill border border-outline-variant/60 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={page === pageCount}
                className="inline-flex items-center gap-1 rounded-pill border border-outline-variant/60 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </>
      )}

      <GrantRoleDialog
        open={grantOpen}
        onClose={(notice) => {
          setGrantOpen(false)
          if (notice) setSuccess(notice)
        }}
      />
    </div>
  )
}

function GrantRoleDialog({ open, onClose }: { open: boolean; onClose: (notice?: string) => void }) {
  const grant = useGrantRole()
  const [email, setEmail] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAccount, setSelectedAccount] = useState<AccountSearchRow | null>(null)
  const [role, setRole] = useState<PlatformRole>('moderator')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const accountSearch = useAccountSearch(searchQuery)

  useEffect(() => {
    if (!open) return
    setEmail('')
    setSearchQuery('')
    setSelectedAccount(null)
    setRole('moderator')
    setReason('')
    setError(null)
  }, [open])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(email), 250)
    return () => window.clearTimeout(timer)
  }, [email])

  async function submit() {
    setError(null)
    try {
      if (!selectedAccount) return
      await grant.mutateAsync({ p_user_id: selectedAccount.user_id, p_role: role, p_reason: reason.trim() })
      onClose(`${PLATFORM_ROLE_LABELS[role]} role granted to ${selectedAccount.display_name || selectedAccount.email}.`)
    } catch (e) {
      setError(formatError(e))
    }
  }

  return (
    <Modal open={open} onClose={() => onClose()} title="Grant a role">
      {error && <p role="alert" className="mb-4 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}
      <label className="relative block min-w-0 text-sm font-semibold text-on-surface">
        Find an account
        <input
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setSelectedAccount(null)
          }}
          placeholder="Search by name or email"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={!selectedAccount && email.trim().length >= 2 && (accountSearch.isFetching || accountSearch.data != null)}
          className="mt-1.5 block w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
        />
        {!selectedAccount && email.trim().length >= 2 && (
          <div role="listbox" className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-lowest p-1 shadow-lift">
            {accountSearch.isFetching ? (
              <p className="flex items-center gap-2 px-3 py-3 text-xs text-on-surface-variant">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                Searching accounts...
              </p>
            ) : accountSearch.isError ? (
              <p className="px-3 py-3 text-xs text-error">Could not search accounts. Try again.</p>
            ) : accountSearch.data?.length ? (
              accountSearch.data.map((account) => (
                <button
                  key={account.user_id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setSelectedAccount(account)
                    setEmail(account.email)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-container"
                >
                  <Avatar name={account.display_name || '?'} src={null} className="h-8 w-8 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-on-surface">{account.display_name}</span>
                    <span className="block truncate text-xs text-on-surface-variant">{account.email}</span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-xs text-on-surface-variant">No matching accounts found.</p>
            )}
          </div>
        )}
        {selectedAccount && (
          <div className="mt-2 flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl border border-primary/30 bg-primary-container/10 px-3 py-2">
            <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs text-on-surface">
              Selected: <strong>{selectedAccount.display_name}</strong> ({selectedAccount.email})
            </span>
            <button
              type="button"
              aria-label="Choose a different account"
              onClick={() => {
                setSelectedAccount(null)
                setEmail('')
              }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
      </label>
      <label className="mt-4 block text-sm font-semibold text-on-surface">
        Role
        <span className="relative mt-1.5 block">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as PlatformRole)}
            className="w-full appearance-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 pr-10 text-sm font-normal text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
        </span>
      </label>
      <label className="mt-4 block text-sm font-semibold text-on-surface">
        Reason
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why is this role being granted?"
          maxLength={500}
          className="mt-1.5 block w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
        />
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onClose()}
          className="rounded-pill px-4 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={grant.isPending || !selectedAccount || !reason.trim()}
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
        >
          {grant.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Grant role
        </button>
      </div>
    </Modal>
  )
}