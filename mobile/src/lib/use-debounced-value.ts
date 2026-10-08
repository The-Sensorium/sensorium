import { useEffect, useState } from 'react'

/** Debounced copy of a fast-changing value (e.g. search input) for query keys.
 * Updates only after `wait` ms without a change; resets on each new value.
 * Same semantics as TanStack Pacer's `useDebouncedValue(value, { wait })`,
 * inlined to avoid a new dependency for a single search box. React's
 * `useDeferredValue` is deliberately not used here: per the React docs it
 * defers rendering but still fires every intermediate network request,
 * while debouncing fires fewer requests. */
export function useDebouncedValue<T>(value: T, wait = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), wait)
    return () => clearTimeout(timer)
  }, [value, wait])
  return debounced
}
