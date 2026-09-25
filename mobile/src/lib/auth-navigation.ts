import { router, type Href } from 'expo-router'

// Auth transitions cross navigator groups, where replace alone can leave the
// previous screen in the native back stack (back from home returns to login
// on first sign-in, but not after a cold start). Popping dismissible screens
// first keeps the back stack clean.
export function resetTo(href: Href) {
  try {
    if (router.canDismiss()) router.dismissAll()
  } catch {
    // Dismiss is best effort; the replace below still moves the user.
  }
  router.replace(href)
}

export function goHome() {
  resetTo('/(app)/home')
}

export function goLogin() {
  resetTo('/(auth)/login')
}

export function goRestricted() {
  resetTo('/restricted')
}
