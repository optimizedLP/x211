import { NOW } from '../clock'
import type {
  BulkItem,
  Device,
  DeviceStatus,
  InventorySnapshot,
  Location,
  Staff,
} from '../types'
import { createSeedSnapshot } from './seed'

/**
 * Sample fleet for the public demo build only (`VITE_DEMO=1`).
 *
 * Every row here is invented: the names, rooms, tags and serials are made up so
 * the showcase can look like a real school without publishing any of it. The
 * production app never imports this file at runtime — see the guard in
 * `vite.config.ts`, which also strips the Supabase variables from demo builds.
 *
 * Dates are generated relative to the day the page loads, so "expired" and
 * "expires soon" stay meaningful however long the demo sits online.
 */

const LOCATIONS: readonly Location[] = [
  { id: 'loc-108', name: 'Room 108', roomNumber: '108', floor: '1' },
  { id: 'loc-112', name: 'Room 112', roomNumber: '112', floor: '1' },
  { id: 'loc-118', name: 'Room 118', roomNumber: '118', floor: '1' },
  { id: 'loc-207', name: 'Room 207', roomNumber: '207', floor: '2' },
  { id: 'loc-214', name: 'Room 214', roomNumber: '214', floor: '2' },
  { id: 'loc-301', name: 'Room 301', roomNumber: '301', floor: '3' },
  { id: 'loc-315', name: 'Room 315', roomNumber: '315', floor: '3' },
  { id: 'loc-library', name: 'Library', roomNumber: '201', floor: '2' },
  { id: 'loc-office', name: 'Main office', roomNumber: '101', floor: '1' },
  { id: 'loc-storage', name: 'Storage room', roomNumber: null, floor: 'B' },
]

const STAFF: readonly Staff[] = [
  { id: 'stf-rivera', name: 'J. Rivera', role: 'Teacher' },
  { id: 'stf-ortiz', name: 'M. Ortiz', role: 'Teacher' },
  { id: 'stf-chen', name: 'A. Chen', role: 'Teacher' },
  { id: 'stf-patel', name: 'S. Patel', role: 'Lab technician' },
  { id: 'stf-brown', name: 'L. Brown', role: 'Teacher' },
  { id: 'stf-kim', name: 'D. Kim', role: 'Assistant principal' },
  { id: 'stf-alvarez', name: 'T. Alvarez', role: 'Teacher' },
]

const MODELS: readonly { categoryId: string; brand: string; model: string }[] = [
  { categoryId: 'cat-laptop', brand: 'Dell', model: 'Latitude 5440' },
  { categoryId: 'cat-laptop', brand: 'HP', model: 'ProBook 450 G9' },
  { categoryId: 'cat-laptop', brand: 'Lenovo', model: 'ThinkPad E14' },
  { categoryId: 'cat-chromebook', brand: 'Acer', model: 'Chromebook 511' },
  { categoryId: 'cat-chromebook', brand: 'Lenovo', model: '100e Gen 4' },
  { categoryId: 'cat-chromebook', brand: 'HP', model: 'Chromebook 11 G9' },
  { categoryId: 'cat-ipad', brand: 'Apple', model: 'iPad (9th gen)' },
  { categoryId: 'cat-ipad', brand: 'Apple', model: 'iPad Air (5th gen)' },
  { categoryId: 'cat-monitor', brand: 'Dell', model: 'P2422H' },
  { categoryId: 'cat-monitor', brand: 'HP', model: 'E24 G5' },
  { categoryId: 'cat-printer', brand: 'Brother', model: 'HL-L2350DW' },
  { categoryId: 'cat-printer', brand: 'HP', model: 'LaserJet M110we' },
]

const VENDORS = ['CDW-G', 'SHI', 'Apple Education', 'Dell Direct'] as const

const iso = (date: Date): string => date.toISOString().slice(0, 10)

function monthsFrom(base: Date, months: number): Date {
  const moved = new Date(base)
  moved.setMonth(moved.getMonth() + months)
  return moved
}

function statusFor(index: number): DeviceStatus {
  if (index % 17 === 0) return 'Disposed'
  if (index % 13 === 0) return 'Obsolete'
  if (index % 9 === 0) return 'Ticket Open'
  if (index % 6 === 0) return 'Needs Repair'
  return 'In Service'
}

/** Warranty ends spread from two years overdue to three years out. */
function warrantyEndFor(index: number): Date {
  if (index % 7 === 0) return monthsFrom(NOW, -8)
  if (index % 11 === 0) return monthsFrom(NOW, 1)
  if (index % 5 === 0) return monthsFrom(NOW, 10)
  return monthsFrom(NOW, 14 + (index % 5) * 6)
}

function devices(): Device[] {
  return Array.from({ length: 44 }, (_, offset) => {
    const index = offset + 1
    const model = MODELS[offset % MODELS.length] as (typeof MODELS)[number]
    const location = LOCATIONS[offset % LOCATIONS.length] as Location
    const holder = STAFF[offset % STAFF.length] as Staff
    const warrantyEnd = warrantyEndFor(offset)
    const warrantyStart = monthsFrom(warrantyEnd, -36)
    const status = statusFor(index)
    // A real fleet has gaps: some units lost their tag, some their serial.
    const assetTag = index % 8 === 0 ? null : `X211-${1000 + index}`
    const serial = index % 9 === 0 ? null : `DM${String(480000 + index * 137)}`
    const removed = index > 42

    return {
      id: `demo-dev-${String(index).padStart(2, '0')}`,
      trackingType: 'serialized',
      categoryId: model.categoryId,
      brand: model.brand,
      model: model.model,
      assetTag,
      serial,
      locationId: location.id,
      assignedTo: index % 7 === 0 ? null : holder.name,
      status,
      warrantyStart: iso(warrantyStart),
      warrantyEnd: iso(warrantyEnd),
      purchaseDate: iso(warrantyStart),
      vendor: VENDORS[offset % VENDORS.length] as string,
      notes: index % 10 === 0 ? 'Charger missing at last check.' : null,
      photoUrl: null,
      createdAt: iso(monthsFrom(NOW, -(index % 14))),
      updatedAt: iso(monthsFrom(NOW, -(index % 5))),
      // Two records sit in "Recently removed" so that screen is not empty.
      deletedAt: removed ? new Date(NOW.getTime() - index * 3_600_000).toISOString() : null,
    }
  })
}

function bulkItems(): BulkItem[] {
  const kinds = ['cat-charger', 'cat-keyboard', 'cat-mouse', 'cat-cable'] as const
  const rooms = LOCATIONS.slice(0, 6)
  return rooms.flatMap((location, roomIndex) =>
    kinds.map((categoryId, kindIndex) => ({
      id: `demo-bulk-${roomIndex}-${kindIndex}`,
      categoryId,
      quantity: 4 + ((roomIndex * 3 + kindIndex * 5) % 17),
      locationId: location.id,
      notes: null,
      updatedAt: iso(NOW),
    })),
  )
}

export function createDemoSnapshot(): InventorySnapshot {
  const blank = createSeedSnapshot()
  return {
    ...blank,
    devices: devices(),
    locations: [...LOCATIONS],
    staff: [...STAFF],
    bulkItems: bulkItems(),
  }
}
