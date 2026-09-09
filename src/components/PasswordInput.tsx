import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  required?: boolean
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)
  const inputId = useId()

  return (
    <div>
      <label htmlFor={inputId} className="text-sm font-semibold text-on-surface">
        {label}
      </label>
      <span className="relative mt-1.5 block">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-on-surface-variant transition-colors hover:text-on-surface"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          ) : (
            <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </span>
    </div>
  )
}
