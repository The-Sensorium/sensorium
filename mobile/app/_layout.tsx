import { useEffect, useMemo, type ReactNode } from 'react'
import { DarkTheme, DefaultTheme, ThemeProvider, router, Stack } from 'expo-router'
import * as Linking from 'expo-linking'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SpecialElite_400Regular, useFonts } from '@expo-google-fonts/special-elite'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { AppProviders } from '../src/app-providers'
import { colors, darkColors } from '../src/lib/theme-tokens'
import { useResolvedScheme } from '../src/lib/theme-choice'
import { handleAuthCallback } from '../src/lib/deep-links'

void SplashScreen.preventAutoHideAsync()

function useAuthDeepLinks() {
  useEffect(() => {
    async function consume(url: string) {
      try {
        const result = await handleAuthCallback(url)
        if (result === 'recovery') router.replace('/(auth)/reset-password')
        else if (result === 'session') router.replace('/(app)/home')
      } catch (err) {
        console.warn('Auth link failed', err)
      }
    }
    void Linking.getInitialURL().then((url) => {
      if (url) void consume(url)
    })
    const sub = Linking.addEventListener('url', ({ url }) => void consume(url))
    return () => sub.remove()
  }, [])
}

export default function RootLayout() {
  useAuthDeepLinks()
  const [fontsLoaded, fontError] = useFonts({
    SpecialElite_400Regular,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
    <AppProviders>
      <ThemedStatusBar />
      <ThemedNavigator>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="restricted" />
          <Stack.Screen name="appeal" />
          <Stack.Screen name="privacy-policy" />
          <Stack.Screen name="terms" />
        </Stack>
      </ThemedNavigator>
    </AppProviders>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function ThemedNavigator({ children }: { children: ReactNode }) {
  const scheme = useResolvedScheme()
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme
  const palette = scheme === 'dark' ? darkColors : colors
  const theme = useMemo(
    () => ({
      ...base,
      colors: {
        ...base.colors,
        background: palette.background,
        card: palette.surface,
        text: palette.onBackground,
        border: palette.outlineVariant,
        primary: palette.primary,
        notification: palette.error,
      },
    }),
    [base, palette],
  )
  return <ThemeProvider value={theme}>{children}</ThemeProvider>
}

function ThemedStatusBar() {
  const scheme = useResolvedScheme()
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
}
