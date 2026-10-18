import { useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

/**
 * A stable string key for a dependency list. Dates are handled explicitly so
 * they compare by instant rather than by object identity.
 */
function depsKey(deps: readonly unknown[]): string {
  return deps
    .map((dep) => (dep instanceof Date ? `@${dep.getTime()}` : JSON.stringify(dep) ?? ''))
    .join('|')
}

/**
 * Tiny data-fetching hook. The adapter interface is async, so the UI needs
 * loading and error handling even while the backend is a localStorage mock —
 * this keeps that honest from day one, and means a slow Supabase query needs no
 * changes here.
 *
 * Loading is *derived* from whether the stored result matches the current deps
 * rather than being set at the top of the effect, which keeps the effect free
 * of synchronous state updates. Previous data stays on screen while a new
 * request is in flight, so typing in the search box never flashes an empty
 * table.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const key = depsKey(deps)
  const [state, setState] = useState<{ key: string; data: T | null; error: Error | null }>({
    key: '',
    data: null,
    error: null,
  })

  // Keep the latest callback in a ref so the fetch effect can list `key` alone
  // as its dependency instead of an unstable `fn`.
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    let cancelled = false

    fnRef.current().then(
      (data) => {
        if (!cancelled) setState({ key, data, error: null })
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            key,
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [key])

  const current = state.key === key
  return {
    data: state.data,
    loading: !current,
    error: current ? state.error : null,
  }
}
