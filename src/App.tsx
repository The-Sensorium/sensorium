import { Analytics } from '@vercel/analytics/react'
import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
      <Analytics />
    </ErrorBoundary>
  )
}
