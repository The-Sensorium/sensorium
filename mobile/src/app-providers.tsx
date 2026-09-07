import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import { registerPushToken, unregisterPushToken } from './lib/push'
import { isPermanentQueryError } from './lib/query-retry'
import { AuthContext, type AuthStatus } from './auth-context'
import { ThemeChoiceProvider } from './lib/theme-choice'



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isPermanentQueryError(error)) return false
        return failureCount < 2
      },
    },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthStatus>({ state: 'loading' })

  useEffect(() => {
    if (!supabase) {
      setAuth({ state: 'unconfigured' })
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s?.user) {
        setAuth({ state: 'signedIn', userId: s.user.id, email: s.user.email })
        void registerPushToken(s.user.id)
      } else {
        setAuth({ state: 'signedOut' })
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuth({ state: 'signedIn', userId: session.user.id, email: session.user.email })
        void registerPushToken(session.user.id)
      } else {
        setAuth({ state: 'signedOut' })
        void unregisterPushToken()
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <ThemeChoiceProvider>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    </ThemeChoiceProvider>
  )
}
