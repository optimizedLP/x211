import type { BulkItem, Category, Device, DeviceStatus, Location, Staff } from '../types'
import type { WarrantyBucket } from '../warranty'

/**
 * What the caller must supply to create a device. The adapter owns the rest —
 * id, tracking type (derived from the category), created/updated timestamps —
 * so no screen can invent a record that disagrees with the catalog.
 */
export interface NewDeviceInput {
  categoryId: string
  brand: string
  model: string
  assetTag?: string | null
  serial?: string | null
  locationId?: string | null
  /**
   * Raw room text from a spreadsheet. When no `locationId` matches, the adapter
   * finds or creates the room from this, so the location list fills itself from
   * real data instead of needing a setup screen.
   */
  locationName?: string | null
  /** Staff name. Imported sheets routinely name people who are not on the list yet. */
  assignedTo?: string | null
  /** Defaults to `In Service` when omitted. */
  status?: DeviceStatus
  warrantyStart?: string | null
  warrantyEnd?: string | null
  purchaseDate?: string | null
  vendor?: string | null
  notes?: string | null
  photoUrl?: string | null
}

export interface ImportOutcome {
  created: Device[]
  /**
   * Asset tags that already exist, so the row was skipped rather than
   * overwritten. The caller knows which source row each tag came from.
   */
  duplicates: string[]
  /** Rooms the import had to add, so the caller can say what it learned. */
  newLocations: string[]
  /** Holders the import had to add, same reason. */
  newStaff: string[]
}

/**
 * The seam between the UI and whatever is storing the data.
 *
 * Everything in the app talks to this interface and nothing else. The current
 * implementation (`mockAdapter.ts`) keeps records in localStorage; when the
 * Supabase project exists, a `supabaseAdapter.ts` satisfying this same
 * interface drops in and no component has to change.
 *
 * Filtering lives behind the interface on purpose — a real backend should run
 * this as SQL, not by shipping every row to the browser.
 */
export interface DeviceQuery {
  /** Free-text across asset tag, serial, brand, model, room, category, holder. */
  search?: string
  statuses?: readonly DeviceStatus[]
  categoryId?: string
  locationId?: string
  warrantyBuckets?: readonly WarrantyBucket[]
  /** Archived/retired devices are excluded unless this is true. */
  includeRetired?: boolean
  /**
   * Soft-deleted records are excluded unless this is true. Duplicate checks
   * need them, because a removed record still owns its asset tag.
   */
  includeDeleted?: boolean
}

export interface InventoryAdapter {
  listDevices(query?: DeviceQuery, now?: Date): Promise<Device[]>
  getDevice(id: string): Promise<Device | null>
  updateDevice(id: string, patch: Partial<Device>): Promise<Device>
  /** Batch status change — one statement on a real backend, not N round trips. */
  updateDevices(ids: readonly string[], patch: Partial<Device>): Promise<Device[]>

  /**
   * Soft delete: the record keeps its asset tag and can be restored, but drops
   * out of every list, counter and duplicate check for new records.
   */
  deleteDevice(id: string): Promise<Device>
  /**
   * Soft delete in one statement — the device list's bulk selection. Same
   * meaning as `deleteDevice`: the records keep their asset tags and every one
   * of them can be restored from the undo bin. Ids that are not on file are
   * skipped rather than failing the whole batch, so one stale selection cannot
   * block the rest.
   */
  deleteDevices(ids: readonly string[]): Promise<Device[]>
  restoreDevice(id: string): Promise<Device>
  /** Removed records only, most recently removed first. */
  listDeletedDevices(): Promise<Device[]>
  /**
   * Permanent delete, for erasing something that was never a real asset.
   * Throws unless the record is already soft-deleted, so the two-step is
   * enforced by the data layer rather than by one screen remembering it.
   */
  purgeDevice(id: string): Promise<void>

  /**
   * One new record. Throws when the asset tag is already on file, which is the
   * constraint a Postgres `UNIQUE (asset_tag)` will enforce for real.
   */
  createDevice(input: NewDeviceInput): Promise<Device>
  /**
   * Bulk create for the spreadsheet import. Callers resolve category ids first.
   * Rooms and holders are *learned* here: a room name or person the app has not
   * seen before is added to the reference lists in the same write, so the
   * dropdowns fill themselves from real data. This method also guards asset-tag
   * uniqueness, which is the one check that can still race with another tab.
   * Duplicate tags are reported and skipped instead of throwing, because one bad
   * row must not lose 300 good ones — all-or-nothing is the wrong failure mode
   * for a human sheet.
   */
  importDevices(inputs: readonly NewDeviceInput[]): Promise<ImportOutcome>

  listCategories(): Promise<Category[]>
  listLocations(): Promise<Location[]>
  listStaff(): Promise<Staff[]>
  listBulkItems(): Promise<BulkItem[]>

  /** Counts per warranty bucket — powers the dashboard tiles. */
  warrantySummary(now?: Date): Promise<Record<WarrantyBucket, number>>

  /** Drops every local record and returns to a blank fleet. Mock-only convenience. */
  reset(): Promise<void>
}
