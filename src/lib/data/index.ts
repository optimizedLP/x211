import { isBackendConfigured } from '../supabase'
import { createMockAdapter } from './mockAdapter'
import { createSupabaseAdapter } from './supabaseAdapter'
import type { InventoryAdapter } from './types'

export type {
  DeviceQuery,
  ImportOutcome,
  InventoryAdapter,
  NewDeviceInput,
} from './types'

/**
 * Single point where the app picks its backend: Supabase when both public env
 * vars are present, browser-local data otherwise. A fresh clone with no
 * `.env.local` still runs, which is what makes the demo path safe to keep.
 */
const backend = isBackendConfigured ? createSupabaseAdapter() : createMockAdapter()

/**
 * A mutation counter, so screens that fetched through `useAsync` can refetch
 * after a write. Screens live outside the route being edited, so without this
 * the Warranty page or the device list would keep showing pre-change totals.
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
 * Writes are wrapped rather than called directly, so every adapter gets the
 * same change notification for free — another screen can be showing the same
 * records and would otherwise keep the pre-change totals.
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

  async deleteDevices(ids) {
    const removed = await backend.deleteDevices(ids)
    // Nothing to announce when every id was already gone.
    if (removed.length > 0) emitChange()
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

  async purgeDevices(ids) {
    const erased = await backend.purgeDevices(ids)
    if (erased.length > 0) emitChange()
    return erased
  },

  async createDevice(input) {
    const created = await backend.createDevice(input)
    emitChange()
    return created
  },

  async ensureLocation(name) {
    const location = await backend.ensureLocation(name)
    emitChange()
    return location
  },

  async ensureStaff(name) {
    const person = await backend.ensureStaff(name)
    emitChange()
    return person
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

/** False once the Supabase env vars are set — used to hide local-only controls. */
export const isDemoData = !isBackendConfigured
