import { Analytics } from '@vercel/analytics/react'
import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OfflineBanner } from './components/OfflineBanner'

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <OfflineBanner />
        <AppRouter />
      </AppProviders>
      <Analytics />
    </ErrorBoundary>
  )
}
