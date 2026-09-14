import { useLocation, useNavigate } from 'react-router'

/** Goes back to the previous page, or to the fallback when there is no
 * in-app history (deep link, bookmark, or fresh reload). */
export function useBackOr(fallback: string): () => void {
  const navigate = useNavigate()
  const { key } = useLocation()
  return () => {
    if (key === 'default') navigate(fallback, { replace: true })
    else navigate(-1)
  }
}
