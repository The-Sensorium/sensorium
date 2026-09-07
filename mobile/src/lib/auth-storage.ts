import AsyncStorage from '@react-native-async-storage/async-storage'

const SIGNUP_EMAIL_KEY = 'sensorium:signup-email'

export function getSignupEmail(): Promise<string | null> {
  return AsyncStorage.getItem(SIGNUP_EMAIL_KEY)
}

export function setSignupEmail(email: string): Promise<void> {
  return AsyncStorage.setItem(SIGNUP_EMAIL_KEY, email)
}
