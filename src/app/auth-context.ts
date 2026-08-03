import { createContext, useContext } from 'react'

export type AuthStatus =
  | { state: 'unconfigured' }
  | { state: 'loading' }
  | { state: 'signedOut' }
  | { state: 'signedIn'; userId: string; email: string | undefined }

export const AuthContext = createContext<AuthStatus>({ state: 'unconfigured' })

export function useAuth(): AuthStatus {
  return useContext(AuthContext)
}
