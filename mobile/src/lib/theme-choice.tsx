import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Appearance, useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeChoice = 'light' | 'system' | 'dark'

const STORAGE_KEY = 'sensorium:theme'

const ThemeChoiceContext = createContext<{
  choice: ThemeChoice
  setChoice: (choice: ThemeChoice) => void
}>({ choice: 'system', setChoice: () => {} })

export function ThemeChoiceProvider({ children }: { children: ReactNode }) {
  // System is the default so fresh installs follow the device theme.
  // A stored choice overrides this on launch; Settings > Appearance
  // keeps Light available for users who want the brand light theme.
  const [choice, setChoiceState] = useState<ThemeChoice>('system')
  const [hydrated, setHydrated] = useState(false)

  // Gated on hydration: applying the default before the stored value
  // loads would flash returning users into the wrong theme for a frame.
  useEffect(() => {
    if (hydrated) Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice)
  }, [choice, hydrated])

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'light' || value === 'dark' || value === 'system') setChoiceState(value)
        setHydrated(true)
      })
      .catch(() => setHydrated(true))
  }, [])

  function setChoice(next: ThemeChoice) {
    setChoiceState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  }

  return (
    <ThemeChoiceContext.Provider value={{ choice, setChoice }}>
      {children}
    </ThemeChoiceContext.Provider>
  )
}

export function useThemeChoice() {
  return useContext(ThemeChoiceContext)
}

export function useResolvedScheme(): 'light' | 'dark' {
  const { choice } = useThemeChoice()
  const system = useColorScheme()
  if (choice === 'light') return 'light'
  if (choice === 'dark') return 'dark'
  return system === 'dark' ? 'dark' : 'light'
}
