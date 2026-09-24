import { useCallback } from 'react'
import { Keyboard } from 'react-native'
import { useFocusEffect } from 'expo-router'

// Dismiss the keyboard when a retained tab route loses focus. Tab screens
// stay mounted while unfocused, so a focused TextInput would otherwise keep
// a stale native focus and keyboard inset after navigating away and back.
export function useDismissKeyboardOnBlur() {
  useFocusEffect(
    useCallback(() => {
      return () => {
        Keyboard.dismiss()
      }
    }, []),
  )
}
