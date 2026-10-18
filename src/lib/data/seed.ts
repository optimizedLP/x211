import type { Category, InventorySnapshot, Location, Staff } from '../types'

/**
 * The starting point for a fresh browser: **no devices**.
 *
 * This file used to generate a deterministic 64-device demo fleet. That fleet
 * was removed once real inventory was about to go in — seeded rows kept being
 * mistaken for real records, and every counter on every screen was measuring
 * fiction. An empty fleet is the honest starting point.
 *
 * Categories stay, because a device cannot be created without one (brand and
 * model are free text, category is a pick).
 *
 * Rooms and staff deliberately start empty: they are learned from the data.
 * The first import creates a room for every location in the sheet and a staff
 * entry for every holder, so those dropdowns describe the real school instead
 * of a guessed one.
 *
 * Nothing here depends on the clock any more, so two installs open on exactly
 * the same blank state.
 */

const CATEGORIES: readonly Category[] = [
  { id: 'cat-laptop', name: 'Windows Laptop', defaultWarrantyMonths: 36, trackingType: 'serialized' },
  { id: 'cat-chromebook', name: 'Chromebook', defaultWarrantyMonths: 12, trackingType: 'serialized' },
  { id: 'cat-ipad', name: 'iPad', defaultWarrantyMonths: 12, trackingType: 'serialized' },
  { id: 'cat-monitor', name: 'Monitor', defaultWarrantyMonths: 36, trackingType: 'serialized' },
  { id: 'cat-printer', name: 'Printer', defaultWarrantyMonths: 36, trackingType: 'serialized' },
  { id: 'cat-charger', name: 'Charger', defaultWarrantyMonths: 12, trackingType: 'bulk' },
  { id: 'cat-keyboard', name: 'Keyboard', defaultWarrantyMonths: 12, trackingType: 'bulk' },
  { id: 'cat-mouse', name: 'Mouse', defaultWarrantyMonths: 12, trackingType: 'bulk' },
  { id: 'cat-cable', name: 'Cable', defaultWarrantyMonths: 12, trackingType: 'bulk' },
]

// Learned from imported sheets: the import adds a room the first time it sees
// one. Nothing is guessed here.
const LOCATIONS: readonly Location[] = []

// Names only — there is deliberately no email field: the workflow is classroom
// + teacher, and an address nobody maintains is worse than none.
const STAFF: readonly Staff[] = []

export function createSeedSnapshot(): InventorySnapshot {
  return {
    devices: [],
    categories: [...CATEGORIES],
    locations: [...LOCATIONS],
    staff: [...STAFF],
    bulkItems: [],
  }
}
