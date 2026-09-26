import { parseLinks } from '../lib/links'
import { cn } from '../lib/utils'

/** Renders plain text with external http(s)/www URLs as safe new-tab links. */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = parseLinks(text)
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <span key={i}>{part.value}</span>
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn('font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary')}
          >
            {part.value}
          </a>
        ),
      )}
    </span>
  )
}
