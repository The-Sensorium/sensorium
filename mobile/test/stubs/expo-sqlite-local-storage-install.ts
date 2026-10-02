// Test double for `expo-sqlite/localStorage/install`, aliased in
// vitest.config.mts. The real shim installs a SQLite-backed global
// `localStorage` on device; under Vitest there is neither a native module
// nor a DOM, so provide a minimal in-memory Web Storage instead.
// supabase-js only needs getItem/setItem/removeItem.
const store = new Map<string, string>()

const memoryStorage = {
  get length(): number {
    return store.size
  },
  key(index: number): string | null {
    return [...store.keys()][index] ?? null
  },
  getItem(key: string): string | null {
    return store.has(key) ? (store.get(key) as string) : null
  },
  setItem(key: string, value: string): void {
    store.set(key, String(value))
  },
  removeItem(key: string): void {
    store.delete(key)
  },
  clear(): void {
    store.clear()
  },
}

if ((globalThis as Record<string, unknown>).localStorage == null) {
  ;(globalThis as Record<string, unknown>).localStorage = memoryStorage
}
