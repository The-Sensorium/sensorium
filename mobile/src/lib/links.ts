export type LinkPart =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string }

const URL_PATTERN = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/

/** Split plain text into text and external link parts. Only http(s) and www. are linked. */
export function parseLinks(text: string): LinkPart[] {
  if (!text) return [{ type: 'text', value: text ?? '' }]
  const parts: LinkPart[] = []
  let last = 0
  let match: RegExpExecArray | null
  URL_PATTERN.lastIndex = 0
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const raw = match[0]
    const trimmed = raw.replace(TRAILING_PUNCT, '')
    if (!trimmed) continue
    const start = match.index
    const end = start + trimmed.length
    if (start > last) parts.push({ type: 'text', value: text.slice(last, start) })
    const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed
    parts.push({ type: 'link', value: trimmed, href })
    last = end
    URL_PATTERN.lastIndex = end
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts.length > 0 ? parts : [{ type: 'text', value: text }]
}
