/**
 * Domain model for the x211 school device inventory.
 *
 * These types are the contract between the UI and the data layer. They are
 * written to map 1:1 onto the Postgres tables sketched in the handoff notes
 * (section 6), so the eventual Supabase adapter can satisfy the same shapes
 * without the UI changing.
 */

/** Serialized assets get one row per physical unit; bulk consumables get a quantity. */
export type TrackingType = 'serialized' | 'bulk'

/**
 * The real workflow, in order. Deliberately not tidy generic states — these
 * mirror what actually happens to a device in a NYC DOE building.
 */
export const DEVICE_STATUSES = [
  'In Service',
  'Needs Repair',
  'In Repair',
  'Repair Denied',
  'Out of Warranty',
  'Obsolete',
  'Pending Pickup',
  'Disposed',
] as const

export type DeviceStatus = (typeof DEVICE_STATUSES)[number]

/** A device in one of these states has left the active fleet. */
export const RETIRED_STATUSES: readonly DeviceStatus[] = ['Obsolete', 'Pending Pickup', 'Disposed']

export function isRetired(status: DeviceStatus): boolean {
  return RETIRED_STATUSES.includes(status)
}

/** Tailwind tone tokens used by the status/warranty badges. */
export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'muted'

/** A device is hopeless once it is out of warranty and has no open ticket. */
export const ACTIVE_STATUSES: readonly DeviceStatus[] = DEVICE_STATUSES.filter(
  (status) => !isRetired(status),
)

export interface Category {
  id: string
  name: string
  /** Used to pre-fill warranty_end when a device is created. */
  defaultWarrantyMonths: number
  trackingType: TrackingType
}

export interface Location {
  id: string
  name: string
  roomNumber: string | null
  floor: string | null
}

export interface Staff {
  id: string
  name: string
  role: string | null
}

export interface Device {
  id: string
  trackingType: TrackingType
  categoryId: string
  brand: string
  model: string
  /** Both labels are null for a meaningful share of the real fleet. */
  assetTag: string | null
  serial: string | null
  locationId: string | null
  /** Staff holder only — student names stay out of v1 (FERPA safety rail). */
  assignedTo: string | null
  status: DeviceStatus
  /** ISO date (YYYY-MM-DD). */
  warrantyStart: string | null
  /** ISO date (YYYY-MM-DD). Drives the whole obsolete/disposal workflow. */
  warrantyEnd: string | null
  purchaseDate: string | null
  vendor: string | null
  notes: string | null
  photoUrl: string | null
  /** ISO date (YYYY-MM-DD). */
  createdAt: string
  /** ISO date (YYYY-MM-DD). */
  updatedAt: string
  /**
   * ISO timestamp when the record was removed, or null.
   *
   * Removal is a soft delete: a mistyped or mis-imported record must be
   * undoable, and a real asset leaving the school should be set to Disposed
   * instead so the audit trail survives. Removed records are hidden from every
   * list and counter but still hold their asset tag, so restoring one can never
   * collide with a record created in the meantime.
   */
  deletedAt: string | null
}

/** Unlabeled consumables: a count per category per location, not a row per item. */
export interface BulkItem {
  id: string
  categoryId: string
  quantity: number
  locationId: string | null
  notes: string | null
  updatedAt: string
}

export interface InventorySnapshot {
  devices: Device[]
  categories: Category[]
  locations: Location[]
  staff: Staff[]
  bulkItems: BulkItem[]
}
