import { useEffect } from 'react'
import { router } from 'expo-router'
import { useMyAccess } from '../features/access'

export function useActiveAccountGate(mode: 'member' | 'restricted') {
  const access = useMyAccess()

  useEffect(() => {
    if (access.isLoading || !access.data) return
    const active = access.data.account_status === 'active'
    if (mode === 'member' && !active) router.replace('/restricted')
    if (mode === 'restricted' && active) router.replace('/(app)/home')
  }, [access.isLoading, access.data, mode])
}
