import { Link } from 'react-router'
import { Cake, Calendar, CalendarCheck, CalendarDays, HeartHandshake, MapPin, MessageSquareText, SlidersHorizontal, UserPlus, Users } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { ThemeToggle } from '../components/theme-toggle'

const howItWorks = [
  { step: '01', title: 'Choose How You Want to Match', body: 'Pick from birth date or location-based matching modes.', icon: SlidersHorizontal },
  { step: '02', title: 'Join a Cluster', body: 'Enter a queue for the mode you choose.', icon: UserPlus },
  { step: '03', title: 'Meet 7 Strangers', body: 'Your cluster forms when exactly eight people are ready.', icon: Users },
  { step: '04', title: 'Complete Introductions', body: 'Answer five questions within 72 hours so everyone can connect.', icon: MessageSquareText },
  { step: '05', title: 'Build Real Connections', body: 'Chat, raise signals, and grow together.', icon: HeartHandshake },
]

const clusterTypes = [
  { title: 'Exact Birthdate', detail: 'Born on the same day, month, and year', icon: Cake },
  { title: 'Birth Year + Month', detail: 'Born in the same month and year', icon: CalendarDays },
  { title: 'Birth Month', detail: 'Born in the same month, any year', icon: Calendar },
  { title: 'Birth Year', detail: 'Born in the same year, any month', icon: CalendarCheck },
  { title: 'Local', detail: 'Within a radius you choose', icon: MapPin },
]

const faqs = [
  { q: 'What is a Cluster?', a: 'A permanent group of exactly eight people built around genuine connection.' },
  { q: 'Why exactly 8 people?', a: 'Small enough to feel intimate, large enough to stay alive when life gets busy.' },
  { q: 'How does matching work, and can I choose how I\u2019m matched?', a: 'You choose the mode (birth date or location) and join its queue.' },
  { q: 'Can I be in more than one cluster at once?', a: 'Yes. Each mode forms its own independent cluster.' },
  { q: 'Can I leave a cluster?', a: 'Anytime. A replacement process finds a new member.' },
]

export function LandingPage() {
  useDocumentTitle('')
  return (
    <div className="bg-background text-on-surface">
      <div className="fixed right-4 top-4 z-30">
        <ThemeToggle />
      </div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 md:pt-24">
        <p className="font-brand text-lg tracking-[0.2em] text-primary">Sensorium</p>
        <h1 className="mt-4 max-w-2xl text-4xl leading-tight font-bold md:text-5xl">
          Eight strangers. One cluster.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-7 text-on-surface-variant">
          Build meaningful friendships through small permanent groups of exactly eight people.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/auth/signup"
            className="rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Join Sensorium
          </Link>
          <Link
            to="/auth/login"
            className="rounded-pill border border-outline px-6 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-outline-variant/60 bg-surface-container/50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-semibold">How It Works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {howItWorks.map((item) => (
              <article key={item.step} className="rounded-2xl bg-surface-lowest p-6 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="font-display text-sm font-semibold text-primary">{item.step}</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Cluster types */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-semibold">Cluster Types</h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clusterTypes.map((c) => (
            <li key={c.title} className="rounded-2xl border border-outline-variant/60 bg-surface-lowest p-6 shadow-soft">
              <c.icon className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
              <h3 className="mt-3 font-display text-lg font-semibold">{c.title}</h3>
              <p className="mt-1 text-sm text-on-surface-variant">{c.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="border-t border-outline-variant/60 bg-surface-container/50">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-3xl font-semibold">FAQ</h2>
          <dl className="mt-8 space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-2xl bg-surface-lowest p-6 shadow-soft">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 text-sm leading-6 text-on-surface-variant">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-outline-variant/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-sm text-on-surface-variant sm:flex-row sm:justify-between">
          <span className="font-brand text-lg tracking-[0.15em] text-on-surface">Sensorium</span>
          <div className="flex gap-6">
            <Link to="/privacy-policy" className="hover:text-on-surface">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-on-surface">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
