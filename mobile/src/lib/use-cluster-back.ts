import { useCallback, useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'
import { router, useFocusEffect, type Href } from 'expo-router'

// Shared hardware-back behavior for hidden tab routes and top-level screens
// (cluster routes, posts, queue, invites, settings sub-screens, legal pages).
// These sit under backBehavior="history" with no native stack, so a cold start
// or a replace-forward transition leaves single-entry history where system
// back would otherwise finish the Activity and land on the phone home screen.
// Walk the visit trail when one exists, else replace to an explicit parent.
export function goBackWithFallback(fallback: Href) {
  if (router.canGoBack()) router.back()
  else router.replace(fallback)
}

export function createClusterBackHandler(getFallback: () => Href) {
  return () => {
    goBackWithFallback(getFallback())
    return true
  }
}

export function subscribeClusterBack(getFallback: () => Href): () => void {
  const sub = BackHandler.addEventListener(
    'hardwareBackPress',
    createClusterBackHandler(getFallback),
  )
  return () => sub.remove()
}

export function useClusterBack(fallback: Href): () => void {
  const fallbackRef = useRef(fallback)
  useEffect(() => {
    fallbackRef.current = fallback
  })
  const goBack = useCallback(() => {
    goBackWithFallback(fallbackRef.current)
  }, [])
  useFocusEffect(
    useCallback(() => subscribeClusterBack(() => fallbackRef.current), []),
  )
  return goBack
}
