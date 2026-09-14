import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Loader2, UserSearch } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { useMyAccess } from '../../features/access'
import { useStaffAccountSearch, useStaffBase } from '../../features/admin-accounts'

export function StaffAccountsPage() {
  useDocumentTitle('Accounts')
  const base = useStaffBase()
  const access = useMyAccess()
  const canSearchEmail = access.data?.capabilities.includes('can_manage_roles') ?? false
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(timer)
  }, [query])
  const search = useStaffAccountSearch(debounced)
  const rows = search.data ?? []

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="font-display text-3xl font-semibold text-on-surface">Accounts</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Look up a member to review status, history, and restrictions.
        </p>
      </header>

      <label className="block text-sm font-semibold text-on-surface" htmlFor="account-search">
        Search by name{canSearchEmail ? ' or email' : ''}
        <input
          id="account-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type at least 2 characters…"
          data-e2e="account-search"
          className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
        />
      </label>

      {debounced.trim().length >= 2 && search.isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : debounced.trim().length >= 2 && search.isError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 p-8 text-center">
          <p className="text-sm font-semibold text-error">Couldn’t search accounts.</p>
          <button
            type="button"
            onClick={() => void search.refetch()}
            className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Try Again
          </button>
        </div>
      ) : debounced.trim().length >= 2 && rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <UserSearch className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">No accounts match “{debounced.trim()}”.</p>
        </div>
      ) : rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.user_id}>
              <Link
                to={`${base}/accounts/${row.user_id}`}
                data-e2e="account-row"
                className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/60 bg-surface px-4 py-3 transition-colors hover:border-primary/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-on-surface">{row.display_name}</span>
                  {row.email && <span className="block truncate text-xs text-on-surface-variant">{row.email}</span>}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {row.account_status !== 'active' && (
                    <span className="rounded-pill bg-error/10 px-2 py-0.5 text-[11px] font-semibold capitalize text-error">
                      {row.account_status}
                    </span>
                  )}
                  {row.roles.map((role) => (
                    <span key={role} className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-semibold capitalize text-on-surface-variant">
                      {role}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

