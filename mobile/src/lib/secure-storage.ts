import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

type SecureStoreModule = typeof import('expo-secure-store')

let secureStore: SecureStoreModule | null | undefined

async function getSecureStore(): Promise<SecureStoreModule | null> {
  if (secureStore !== undefined) return secureStore
  if (Platform.OS === 'web') {
    secureStore = null
    return secureStore
  }
  try {
    secureStore = await import('expo-secure-store')
  } catch {
    secureStore = null
  }
  return secureStore
}

const CHUNK_SIZE = 1800
const COUNT_SUFFIX = '__count'

async function secureGet(key: string): Promise<string | null> {
  const store = await getSecureStore()
  if (!store) return AsyncStorage.getItem(key)
  try {
    const countRaw = await store.getItemAsync(`${key}${COUNT_SUFFIX}`)
    if (!countRaw) {
      const single = await store.getItemAsync(key)
      if (single !== null) return single
      return AsyncStorage.getItem(key)
    }
    const count = Number.parseInt(countRaw, 10)
    if (!Number.isFinite(count) || count <= 0) return null
    let out = ''
    for (let i = 0; i < count; i += 1) {
      const part = await store.getItemAsync(`${key}__${i}`)
      if (part === null) return null
      out += part
    }
    return out
  } catch {
    return AsyncStorage.getItem(key)
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  const store = await getSecureStore()
  if (!store) return AsyncStorage.setItem(key, value)
  try {
    await secureRemove(key)
    if (value.length <= CHUNK_SIZE) {
      await store.setItemAsync(key, value)
      return
    }
    const chunks: string[] = []
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE))
    }
    await Promise.all(chunks.map((part, i) => store.setItemAsync(`${key}__${i}`, part)))
    await store.setItemAsync(`${key}${COUNT_SUFFIX}`, String(chunks.length))
  } catch {
    await AsyncStorage.setItem(key, value)
  }
}

async function secureRemove(key: string): Promise<void> {
  const store = await getSecureStore()
  if (!store) return AsyncStorage.removeItem(key)
  try {
    const countRaw = await store.getItemAsync(`${key}${COUNT_SUFFIX}`).catch(() => null)
    const deletions: Promise<void>[] = [store.deleteItemAsync(key).catch(() => undefined)]
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0
    if (Number.isFinite(count) && count > 0) {
      for (let i = 0; i < count; i += 1) {
        deletions.push(store.deleteItemAsync(`${key}__${i}`).catch(() => undefined))
      }
      deletions.push(store.deleteItemAsync(`${key}${COUNT_SUFFIX}`).catch(() => undefined))
    }
    await Promise.all(deletions)
  } catch {
  }
  await AsyncStorage.removeItem(key).catch(() => undefined)
}

export const SecureStorageAdapter = {
  getItem: (key: string) => secureGet(key),
  setItem: (key: string, value: string) => secureSet(key, value),
  removeItem: (key: string) => secureRemove(key),
}
