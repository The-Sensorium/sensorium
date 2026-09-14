import { Link } from 'react-router'
import { useDocumentTitle } from '../lib/use-document-title'
import { FixedThemeToggle } from '../components/FixedThemeToggle'

export function NotFoundPage() {
  useDocumentTitle('Page Not Found')
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <FixedThemeToggle />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="font-brand text-4xl tracking-[0.15em] text-primary">404</p>
        <h1 className="mt-4 font-display text-2xl font-semibold">This page doesn’t exist</h1>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          The link may be broken, or the page may have moved. Head back home to keep going.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Back to home
        </Link>
      </main>
    </div>
  )
}
