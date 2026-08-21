import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './auth-context'
import { SessionRoleContext, type SessionRoleStatus } from './session-role-context'
import { useMyAccess, type SessionRole } from '../features/access'

const STORAGE_KEY = 'sensorium.sessionRole'

function readStoredRole(): SessionRole | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  return raw === 'member' || raw === 'moderator' || raw === 'admin' ? raw : null
}

/** Persists the user's chosen UI shell per tab (sessionStorage). Never an
 * authorization claim. Cleared on sign-out/auth-user change and when the
 * stored role leaves the account's available roles after an access refresh. */
export function SessionRoleProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const access = useMyAccess()
  const [role, setRoleState] = useState<SessionRole | null>(() => readStoredRole())

  // Ignore the auth provider's bootstrap states. Only a resolved sign-out or a
  // different signed-in user should clear the tab's selected shell.
  const prevUserId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (auth.state === 'unconfigured' || auth.state === 'loading') return

    if (prevUserId.current === undefined) {
      prevUserId.current = userId
      if (userId === null) {
        setRoleState(null)
        window.sessionStorage.removeItem(STORAGE_KEY)
      }
      return
    }
    if (prevUserId.current === userId) return
    prevUserId.current = userId
    setRoleState(null)
    window.sessionStorage.removeItem(STORAGE_KEY)
  }, [auth.state, userId])

  useEffect(() => {
    const available = access.data?.available_session_roles
    if (available && role && !available.includes(role)) {
      setRoleState(null)
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [role, access.data])

  const setRole = useCallback((next: SessionRole) => {
    setRoleState(next)
    window.sessionStorage.setItem(STORAGE_KEY, next)
  }, [])

  const clearRole = useCallback(() => {
    setRoleState(null)
    window.sessionStorage.removeItem(STORAGE_KEY)
  }, [])

  const value: SessionRoleStatus = useMemo(() => ({ role, setRole, clearRole }), [role, setRole, clearRole])

  return <SessionRoleContext.Provider value={value}>{children}</SessionRoleContext.Provider>
}
