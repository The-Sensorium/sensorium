export function badgeLabel(count: number): string | undefined {
  if (count <= 0) return undefined
  if (count > 9) return '9+'
  return String(count)
}
