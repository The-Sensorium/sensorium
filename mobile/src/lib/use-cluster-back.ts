import { useCallback, useEffect, useRef } from 'react'
import { router, type Href } from 'expo-router'

// Shared UI-back behavior for screens pushed above the tabs. The native stack
// owns hardware back and the iOS edge swipe; this covers in-screen back
// buttons and the cold-start case where the fallback route is not in the
// stack yet.
export function goBackWithFallback(fallback: Href) {
  if (router.canGoBack()) router.back()
  else router.dismissTo(fallback)
}

export function useClusterBack(fallback: Href): () => void {
  const fallbackRef = useRef(fallback)
  useEffect(() => {
    fallbackRef.current = fallback
  })
  return useCallback(() => {
    goBackWithFallback(fallbackRef.current)
  }, [])
}
