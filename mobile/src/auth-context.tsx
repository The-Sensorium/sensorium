import { createContext, useContext } from 'react'

export type AuthStatus =
  | { state: 'unconfigured' | 'loading' | 'signedOut' }
  | { state: 'signedIn'; userId: string; email: string | undefined }

export const AuthContext = createContext<AuthStatus>({ state: 'loading' })

export function useAuth(): AuthStatus {
  return useContext(AuthContext)
}
