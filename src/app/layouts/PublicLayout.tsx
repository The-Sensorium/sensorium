import { Link, Outlet } from 'react-router'
import { ThemeToggle } from '../../components/theme-toggle'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="fixed left-4 top-4 z-30">
        <Link to="/" className="font-brand text-lg tracking-[0.15em] text-primary transition-colors hover:text-on-surface">
          Sensorium
        </Link>
      </div>
      <div className="fixed right-4 top-4 z-30">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  )
}
