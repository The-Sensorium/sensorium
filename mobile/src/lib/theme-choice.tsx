import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeChoice = 'light' | 'system' | 'dark'

const STORAGE_KEY = 'sensorium:theme'

const ThemeChoiceContext = createContext<{
  choice: ThemeChoice
  setChoice: (choice: ThemeChoice) => void
}>({ choice: 'light', setChoice: () => {} })

export function ThemeChoiceProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('light')

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'light' || value === 'dark' || value === 'system') setChoiceState(value)
    })
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
