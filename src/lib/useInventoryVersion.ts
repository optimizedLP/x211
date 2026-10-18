import { useSyncExternalStore } from 'react'

import { getInventoryVersion, subscribeInventoryChange } from './data'

/**
 * Re-renders the caller whenever a device is written. Screens pass this into
 * `useAsync` dependencies, which makes them refetch without any manual
 * cache-invalidation plumbing.
 */
export function useInventoryVersion(): number {
  return useSyncExternalStore(subscribeInventoryChange, getInventoryVersion, getInventoryVersion)
}
