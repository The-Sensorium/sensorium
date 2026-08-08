import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ThemeProvider } from '../lib/theme-provider'
import { AuthContext, type AuthStatus } from './auth-context'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Client errors (4xx) won't recover on retry; transient failures get up
        // to two retries before the error surfaces to the UI.
        if (typeof error === 'object' && error !== null && 'status' in error) {
          const status = (error as { status?: unknown }).status
          if (typeof status === 'number' && status >= 400 && status < 500) return false
        }
        return failureCount < 2
      },
    },
  },
})

function SupabaseProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthStatus>({ state: 'unconfigured' })

  useEffect(() => {
    if (!supabase) {
      setAuth({ state: 'unconfigured' })
      return
    }

    setAuth({ state: 'loading' })

    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s?.user) {
        setAuth({
          state: 'signedIn',
          userId: s.user.id,
          email: s.user.email,
        })
      } else {
        setAuth({ state: 'signedOut' })
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuth({
          state: 'signedIn',
          userId: session.user.id,
          email: session.user.email,
        })
      } else {
        setAuth({ state: 'signedOut' })
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SupabaseProvider>{children}</SupabaseProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
