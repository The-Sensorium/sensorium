import { createContext, useContext } from 'react'
import type { SessionRole } from '../features/access'

export type SessionRoleStatus = {
  role: SessionRole | null
  setRole: (role: SessionRole) => void
  clearRole: () => void
}

export const SessionRoleContext = createContext<SessionRoleStatus>({
  role: null,
  setRole: () => {},
  clearRole: () => {},
})

export function useSessionRole(): SessionRoleStatus {
  return useContext(SessionRoleContext)
}