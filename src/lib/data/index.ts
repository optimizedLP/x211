import { createMockAdapter } from './mockAdapter'
import type { InventoryAdapter } from './types'

export type {
  DeviceQuery,
  ImportOutcome,
  InventoryAdapter,
  NewDeviceInput,
} from './types'

const backend = createMockAdapter()

/**
 * A mutation counter, so screens that fetched through `useAsync` can refetch
 * after a write. The sidebar counters live outside the route being edited, so
 * without this they would keep showing the pre-change total.
 */
let version = 0
const listeners = new Set<() => void>()

function emitChange(): void {
  version += 1
  for (const listener of listeners) listener()
}

export function subscribeInventoryChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getInventoryVersion(): number {
  return version
}

/**
 * Single point where the app picks its backend.
 *
 * When the Supabase project is ready, add `supabaseAdapter.ts`, import it here,
 * and switch on `import.meta.env.VITE_DATA_ADAPTER`. Nothing under
 * `src/components` or `src/routes` has to change — they only know this
 * interface.
 *
 * Writes are wrapped rather than called directly so every adapter gets the
 * same change notification for free.
 */
export const inventory: InventoryAdapter = {
  ...backend,

  async updateDevice(id, patch) {
    const updated = await backend.updateDevice(id, patch)
    emitChange()
    return updated
  },

  async updateDevices(ids, patch) {
    const updated = await backend.updateDevices(ids, patch)
    emitChange()
    return updated
  },

  async deleteDevice(id) {
    const removed = await backend.deleteDevice(id)
    emitChange()
    return removed
  },

  async restoreDevice(id) {
    const restored = await backend.restoreDevice(id)
    emitChange()
    return restored
  },

  async purgeDevice(id) {
    await backend.purgeDevice(id)
    emitChange()
  },

  async createDevice(input) {
    const created = await backend.createDevice(input)
    emitChange()
    return created
  },

  async importDevices(inputs) {
    const outcome = await backend.importDevices(inputs)
    // Only notify when something was actually written; an all-duplicate import
    // should not make every screen refetch.
    if (outcome.created.length > 0) emitChange()
    return outcome
  },

  async reset() {
    await backend.reset()
    emitChange()
  },
}

/** True while the app is running on seeded demo data rather than a real backend. */
export const isDemoData = true
