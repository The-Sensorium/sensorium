import { Redirect } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { useAuth } from '../src/auth-context'
import { colors } from '../src/lib/theme-tokens'

export default function Index() {
  const auth = useAuth()

  if (auth.state === 'loading' || auth.state === 'unconfigured') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator />
      </View>
    )
  }

  return <Redirect href={auth.state === 'signedIn' ? '/(app)/home' : '/(auth)/login'} />
}
