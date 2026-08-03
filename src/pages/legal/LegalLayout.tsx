import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        Back to Sensorium
      </Link>
      <article className="mt-6 space-y-6">
        <header>
          <h1 className="font-display text-3xl font-semibold text-on-surface">{title}</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Last updated: {updated}</p>
        </header>
        <div className="space-y-5 text-sm leading-7 text-on-surface">{children}</div>
      </article>
    </main>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-on-surface">{title}</h2>
      <div className="space-y-2 text-on-surface-variant">{children}</div>
    </section>
  )
}