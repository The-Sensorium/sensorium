import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render errors anywhere below it, logs the stack for the console/telemetry,
 * and shows a friendly recovery screen instead of a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Telemetry hook: swap for your error-reporting service (e.g. Sentry) in production.
    console.error('Sensorium error boundary caught an error.', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="font-display text-5xl">😕</p>
        <h1 className="mt-4 text-2xl font-semibold text-on-surface">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          An unexpected error occurred. Please try refreshing, or go back if it keeps happening.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-container"
          >
            Try again
          </button>
          <a href="/" className="rounded-pill border border-outline-variant px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
            Back to home
          </a>
        </div>
      </main>
    )
  }
}