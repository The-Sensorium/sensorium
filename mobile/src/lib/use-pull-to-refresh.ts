import { useCallback, useEffect, useRef, useState } from 'react'
import { toErrorMessage } from './error'

export type RefreshTask = () => Promise<unknown>

function rejectionOf(result: unknown): unknown {
  if (
    typeof result === 'object' &&
    result !== null &&
    (result as { isError?: unknown }).isError === true
  ) {
    return (result as { error?: unknown }).error ?? true
  }
  return null
}

export function usePullToRefresh(tasks: RefreshTask[]) {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const tasksRef = useRef(tasks)
  useEffect(() => {
    tasksRef.current = tasks
  })

  const onRefresh = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true
    setRefreshing(true)
    setError(null)
    const runs = tasksRef.current.map((run) => Promise.resolve().then(run))
    void Promise.all(
      runs.map((pending) =>
        pending.then(
          (result) => ({ cause: rejectionOf(result) }),
          (caught) => ({ cause: caught ?? true }),
        ),
      ),
    )
      .then((outcomes) => {
        const failed = outcomes.find((o) => o.cause !== null)
        if (failed) setError(toErrorMessage(failed.cause, 'Couldn’t refresh. Please try again.'))
      })
      .finally(() => {
        busyRef.current = false
        setRefreshing(false)
      })
  }, [])

  return { refreshing, onRefresh, error }
}
