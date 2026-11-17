import { useEffect } from 'react'
import { Keyboard } from 'react-native'
import { usePathname } from 'expo-router'

// Tab screens stay mounted while unfocused, and switching routes does not
// resign first responder, so an input focused on the previous screen keeps the
// keyboard open over the next one. Dismiss it once per navigation instead of
// per screen, so every route (tabs, detail screens, auth) is covered.
export function useDismissKeyboardOnNavigate() {
  const pathname = usePathname()
  useEffect(() => {
    Keyboard.dismiss()
  }, [pathname])
}
