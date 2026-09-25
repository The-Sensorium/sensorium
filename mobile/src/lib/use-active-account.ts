import { useEffect } from 'react'
import { useMyAccess } from '../features/access'
import { goHome, goRestricted } from './auth-navigation'

export function useActiveAccountGate(mode: 'member' | 'restricted') {
  const access = useMyAccess()

  useEffect(() => {
    if (access.isLoading || !access.data) return
    const active = access.data.account_status === 'active'
    if (mode === 'member' && !active) goRestricted()
    if (mode === 'restricted' && active) goHome()
  }, [access.isLoading, access.data, mode])
}
