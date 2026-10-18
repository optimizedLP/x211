import type { Category, InventorySnapshot, Location, Staff } from '../types'

/**
 * The starting point for a fresh browser: **no devices**.
 *
 * This file used to generate a deterministic 64-device demo fleet. That fleet
 * was removed once real inventory was about to go in — seeded rows kept being
 * mistaken for real records, and every counter on every screen was measuring
 * fiction. An empty fleet is the honest starting point.
 *
 * What stays is reference data: the categories, rooms and staff lists that the
 * add-device form and the importer need in order to be usable on day one. They
 * are ordinary starter lists, not records — rename or trim them and nothing
 * breaks.
 *
 * Nothing here depends on the clock any more, so two installs open on exactly
 * the same blank state.
 */

const CATEGORIES: readonly Category[] = [
  { id: 'cat-laptop', name: 'Lenovo Laptop', defaultWarrantyMonths: 36, trackingType: 'serialized' },
  { id: 'cat-chromebook', name: 'Chromebook', defaultWarrantyMonths: 12, trackingType: 'serialized' },
  { id: 'cat-ipad', name: 'iPad', defaultWarrantyMonths: 12, trackingType: 'serialized' },
  { id: 'cat-monitor', name: 'Monitor', defaultWarrantyMonths: 36, trackingType: 'serialized' },
  { id: 'cat-printer', name: 'Printer', defaultWarrantyMonths: 36, trackingType: 'serialized' },
  { id: 'cat-charger', name: 'Charger', defaultWarrantyMonths: 12, trackingType: 'bulk' },
  { id: 'cat-keyboard', name: 'Keyboard', defaultWarrantyMonths: 12, trackingType: 'bulk' },
  { id: 'cat-mouse', name: 'Mouse', defaultWarrantyMonths: 12, trackingType: 'bulk' },
  { id: 'cat-cable', name: 'Cable', defaultWarrantyMonths: 12, trackingType: 'bulk' },
]

const LOCATIONS: readonly Location[] = [
  { id: 'loc-101', name: 'Room 101', roomNumber: '101', floor: '1' },
  { id: 'loc-118', name: 'Room 118', roomNumber: '118', floor: '1' },
  { id: 'loc-214', name: 'Room 214', roomNumber: '214', floor: '2' },
  { id: 'loc-302', name: 'Room 302', roomNumber: '302', floor: '3' },
  { id: 'loc-318', name: 'Room 318', roomNumber: '318', floor: '3' },
  { id: 'loc-lib', name: 'Library', roomNumber: null, floor: '2' },
  { id: 'loc-office', name: 'Main Office', roomNumber: null, floor: '1' },
  { id: 'loc-guid', name: 'Guidance Office', roomNumber: null, floor: '1' },
  { id: 'loc-gym', name: 'Gymnasium', roomNumber: null, floor: '1' },
  { id: 'loc-stem', name: 'STEM Lab', roomNumber: null, floor: '3' },
  { id: 'loc-nurse', name: "Nurse's Office", roomNumber: null, floor: '1' },
  { id: 'loc-av', name: 'Auditorium', roomNumber: null, floor: '1' },
  { id: 'loc-storage', name: 'Storage Room B', roomNumber: null, floor: 'Basement' },
]

// Names and rooms only. There is deliberately no email field: the workflow is
// classroom + teacher, and an address nobody maintains is worse than none.
const STAFF: readonly Staff[] = [
  { id: 'stf-1', name: 'J. Rivera', role: 'IT Analyst' },
  { id: 'stf-2', name: 'M. Chen', role: 'Teacher' },
  { id: 'stf-3', name: 'A. Okafor', role: 'Teacher' },
  { id: 'stf-4', name: 'L. Petrov', role: 'Assistant Principal' },
  { id: 'stf-5', name: 'S. Diaz', role: 'Librarian' },
  { id: 'stf-6', name: 'R. Haddad', role: 'Guidance Counselor' },
]

export function createSeedSnapshot(): InventorySnapshot {
  return {
    devices: [],
    categories: [...CATEGORIES],
    locations: [...LOCATIONS],
    staff: [...STAFF],
    bulkItems: [],
  }
}
