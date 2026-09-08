import { Link, Outlet } from 'react-router'
import { BrandMark } from '../../components/BrandMark'
import { ThemeToggle } from '../../components/theme-toggle'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10">
      <div className="fixed right-4 top-4 z-30">
        <ThemeToggle />
      </div>
      <Link to="/" className="mb-8 flex flex-col items-center gap-2">
        <BrandMark size={64} />
        <span className="font-brand text-lg tracking-[0.15em] text-primary">Sensorium</span>
      </Link>
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  )
}
