import { roomKey, nameKey } from '../reference'
import { getSupabase } from '../supabase'
import type { BulkItem, Category, Device, DeviceStatus, Location, Staff } from '../types'
import { isRetired } from '../types'
import { WARRANTY_BUCKETS, warrantyBucket } from '../warranty'
import type { WarrantyBucket } from '../warranty'
import type { DeviceQuery, ImportOutcome, InventoryAdapter, NewDeviceInput } from './types'

/**
 * Postgres implementation of the same interface the localStorage adapter
 * implements.
 *
 * Filtering and search run in the browser over a short-lived cache of the whole
 * fleet. With a few hundred to a couple of thousand devices that is one paged
 * query and then instant typing, which matters more than pushing every keystroke
 * to Postgres. The cache is dropped on every write in this tab and expires on its
 * own, so another tab's change shows up within a couple of seconds. When the
 * fleet gets big enough to care, move the filter into `.or()`/`.in()` calls —
 * nothing outside this file changes.
 */

interface DeviceRow {
  id: string
  tracking_type: 'serialized' | 'bulk'
  category_id: string
  brand: string
  model: string | null
  asset_tag: string | null
  serial: string | null
  location_id: string | null
  assigned_to: string | null
  status: DeviceStatus
  warranty_start: string | null
  warranty_end: string | null
  purchase_date: string | null
  vendor: string | null
  notes: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  categories?: { name: string } | null
  locations?: { name: string; room_number: string | null; floor: string | null } | null
}

interface LocationRow {
  id: string
  name: string
  room_number: string | null
  floor: string | null
}

interface StaffRow {
  id: string
  name: string
  role: string | null
}

interface CategoryRow {
  id: string
  name: string
  default_warranty_months: number
  tracking_type: 'serialized' | 'bulk'
}

const DEVICE_SELECT = '*, categories(name), locations(name, room_number, floor)'
const PAGE = 1000
const CACHE_MS = 2000

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function tagKey(tag: string): string {
  return tag.trim().toUpperCase()
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    trackingType: row.tracking_type,
    categoryId: row.category_id,
    brand: row.brand,
    model: row.model ?? '',
    assetTag: row.asset_tag,
    serial: row.serial,
    locationId: row.location_id,
    assignedTo: row.assigned_to,
    status: row.status,
    warrantyStart: row.warranty_start,
    warrantyEnd: row.warranty_end,
    purchaseDate: row.purchase_date,
    vendor: row.vendor,
    notes: row.notes,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

/** Same haystack the localStorage adapter builds, so search behaves identically. */
function haystack(row: DeviceRow): string {
  return [
    row.asset_tag,
    row.serial,
    row.brand,
    row.model,
    row.status,
    row.assigned_to,
    row.vendor,
    row.notes,
    row.categories?.name,
    row.locations?.name,
    row.locations?.room_number,
    row.locations?.floor,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLowerCase()
}

function matchesSearch(needle: string, hay: string): boolean {
  return needle
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token))
}

/** Device → snake_case columns, ignoring undefined fields. */
function toRowPatch(patch: Partial<Device>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.trackingType !== undefined) row.tracking_type = patch.trackingType
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId
  if (patch.brand !== undefined) row.brand = patch.brand
  if (patch.model !== undefined) row.model = patch.model
  if (patch.assetTag !== undefined) row.asset_tag = patch.assetTag
  if (patch.serial !== undefined) row.serial = patch.serial
  if (patch.locationId !== undefined) row.location_id = patch.locationId
  if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo
  if (patch.status !== undefined) row.status = patch.status
  if (patch.warrantyStart !== undefined) row.warranty_start = patch.warrantyStart
  if (patch.warrantyEnd !== undefined) row.warranty_end = patch.warrantyEnd
  if (patch.purchaseDate !== undefined) row.purchase_date = patch.purchaseDate
  if (patch.vendor !== undefined) row.vendor = patch.vendor
  if (patch.notes !== undefined) row.notes = patch.notes
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt
  if (patch.deletedAt !== undefined) row.deleted_at = patch.deletedAt
  return row
}

export function createSupabaseAdapter(): InventoryAdapter {
  const client = getSupabase()
  let cache: { rows: DeviceRow[]; at: number } | null = null

  const invalidate = () => {
    cache = null
  }

  /** The whole fleet, paged past Supabase's default 1000-row response cap. */
  async function loadRows(): Promise<DeviceRow[]> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows

    const rows: DeviceRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from('devices')
        .select(DEVICE_SELECT)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      const page = (data ?? []) as unknown as DeviceRow[]
      rows.push(...page)
      if (page.length < PAGE) break
    }

    cache = { rows, at: Date.now() }
    return rows
  }

  async function listLocationsRaw(): Promise<LocationRow[]> {
    const { data, error } = await client.from('locations').select('id, name, room_number, floor')
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as LocationRow[]
  }

  async function listStaffRaw(): Promise<StaffRow[]> {
    const { data, error } = await client.from('staff').select('id, name, role')
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as StaffRow[]
  }

  async function listCategoriesRaw(): Promise<Category[]> {
    const { data, error } = await client.from('categories').select('*').order('name')
    if (error) throw new Error(error.message)
    // Snake_case rows must become the camelCase domain object the UI expects;
    // a raw cast here would leave every category without a trackingType and
    // empty out the add-device form.
    return ((data ?? []) as unknown as CategoryRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      defaultWarrantyMonths: row.default_warranty_months,
      trackingType: row.tracking_type,
    }))
  }

  async function insertDevices(rows: Record<string, unknown>[]): Promise<{
    created: Device[]
    duplicates: string[]
  }> {
    const created: Device[] = []
    const duplicates: string[] = []
    const CHUNK = 100

    for (let start = 0; start < rows.length; start += CHUNK) {
      const chunk = rows.slice(start, start + CHUNK)
      const { data, error } = await client.from('devices').insert(chunk).select(DEVICE_SELECT)
      if (!error) {
        created.push(...((data ?? []) as unknown as DeviceRow[]).map(toDevice))
        continue
      }

      // A duplicate tag aborts a multi-row insert, so isolate the offending rows
      // one by one rather than losing the whole chunk. This is the same outcome
      // as the localStorage adapter: skip the duplicate, keep the rest.
      if (error.code !== '23505') throw new Error(error.message)
      for (const row of chunk) {
        const single = await client.from('devices').insert(row).select(DEVICE_SELECT).single()
        if (single.error) {
          const tag = row.asset_tag
          if (single.error.code === '23505' && typeof tag === 'string') duplicates.push(tag)
          else throw new Error(single.error.message)
          continue
        }
        created.push(toDevice(single.data as unknown as DeviceRow))
      }
    }

    return { created, duplicates }
  }

  return {
    async listDevices(query: DeviceQuery = {}, now: Date = new Date()): Promise<Device[]> {
      const rows = await loadRows()
      return rows
        .filter((row) => (query.includeDeleted ? true : !row.deleted_at))
        .filter((row) => (query.includeRetired ? true : !isRetired(row.status)))
        .filter((row) => (query.statuses?.length ? query.statuses.includes(row.status) : true))
        .filter((row) => (query.categoryId ? row.category_id === query.categoryId : true))
        .filter((row) => (query.locationId ? row.location_id === query.locationId : true))
        .filter((row) =>
          query.warrantyBuckets?.length
            ? query.warrantyBuckets.includes(warrantyBucket(row.warranty_end, now))
            : true,
        )
        .filter((row) => (query.search ? matchesSearch(query.search, haystack(row)) : true))
        .map(toDevice)
    },

    async getDevice(id: string): Promise<Device | null> {
      const { data, error } = await client
        .from('devices')
        .select(DEVICE_SELECT)
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? toDevice(data as unknown as DeviceRow) : null
    },

    async updateDevice(id: string, patch: Partial<Device>): Promise<Device> {
      const { data, error } = await client
        .from('devices')
        .update(toRowPatch(patch))
        .eq('id', id)
        .select(DEVICE_SELECT)
        .single()
      if (error) throw new Error(error.code === 'PGRST116' ? `No device with id ${id}` : error.message)
      invalidate()
      return toDevice(data as unknown as DeviceRow)
    },

    async updateDevices(ids: readonly string[], patch: Partial<Device>): Promise<Device[]> {
      const { data, error } = await client
        .from('devices')
        .update(toRowPatch(patch))
        .in('id', [...ids])
        .select(DEVICE_SELECT)
      if (error) throw new Error(error.message)
      invalidate()
      return ((data ?? []) as unknown as DeviceRow[]).map(toDevice)
    },

    async deleteDevice(id: string): Promise<Device> {
      const { data, error } = await client
        .from('devices')
        .update({ deleted_at: new Date().toISOString(), updated_at: today() })
        .eq('id', id)
        .select(DEVICE_SELECT)
        .single()
      if (error) throw new Error(error.code === 'PGRST116' ? `No device with id ${id}` : error.message)
      invalidate()
      return toDevice(data as unknown as DeviceRow)
    },

    async restoreDevice(id: string): Promise<Device> {
      const { data, error } = await client
        .from('devices')
        .update({ deleted_at: null, updated_at: today() })
        .eq('id', id)
        .select(DEVICE_SELECT)
        .single()
      if (error) throw new Error(error.code === 'PGRST116' ? `No device with id ${id}` : error.message)
      invalidate()
      return toDevice(data as unknown as DeviceRow)
    },

    async listDeletedDevices(): Promise<Device[]> {
      const rows = await loadRows()
      return rows
        .filter((row) => row.deleted_at)
        .sort((a, b) => (a.deleted_at ?? '').localeCompare(b.deleted_at ?? ''))
        .reverse()
        .map(toDevice)
    },

    async purgeDevice(id: string): Promise<void> {
      // The `.not(deleted_at, null)` is the two-step rule, enforced by the
      // database rather than by a screen remembering to check.
      const { data, error } = await client
        .from('devices')
        .delete()
        .eq('id', id)
        .not('deleted_at', 'is', null)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('Remove the device before erasing it permanently.')
      invalidate()
    },

    async createDevice(input: NewDeviceInput): Promise<Device> {
      const categories = await listCategoriesRaw()
      const category = categories.find((item) => item.id === input.categoryId)
      if (!category) throw new Error(`Unknown category: ${input.categoryId}`)

      const { data, error } = await client
        .from('devices')
        .insert({
          tracking_type: category.trackingType,
          category_id: category.id,
          brand: input.brand.trim(),
          model: input.model.trim(),
          asset_tag: input.assetTag?.trim() || null,
          serial: input.serial?.trim() || null,
          location_id: input.locationId || null,
          assigned_to: input.assignedTo?.trim() || null,
          status: input.status ?? 'In Service',
          warranty_start: input.warrantyStart || null,
          warranty_end: input.warrantyEnd || null,
          purchase_date: input.purchaseDate || null,
          vendor: input.vendor || null,
          notes: input.notes || null,
          photo_url: input.photoUrl || null,
        })
        .select(DEVICE_SELECT)
        .single()
      if (error) {
        if (error.code === '23505' && input.assetTag) {
          throw new Error(`Asset tag ${input.assetTag} is already on another device.`)
        }
        throw new Error(error.message)
      }
      invalidate()
      return toDevice(data as unknown as DeviceRow)
    },

    async importDevices(inputs: readonly NewDeviceInput[]): Promise<ImportOutcome> {
      const categories = await listCategoriesRaw()
      const categoryById = new Map(categories.map((category) => [category.id, category]))

      const existingRows = await loadRows()
      const takenTags = new Set(
        existingRows
          .map((row) => row.asset_tag)
          .filter((tag): tag is string => Boolean(tag))
          .map(tagKey),
      )

      const locations = await listLocationsRaw()
      const staff = await listStaffRaw()
      const locationByKey = new Map<string, LocationRow>()
      for (const location of locations) {
        locationByKey.set(roomKey(location.name), location)
        if (location.room_number) locationByKey.set(roomKey(location.room_number), location)
      }
      const staffByKey = new Map<string, StaffRow>()
      for (const person of staff) staffByKey.set(nameKey(person.name), person)

      const newLocationRows: LocationRow[] = []
      const newStaffRows: StaffRow[] = []
      const newLocations: string[] = []
      const newStaff: string[] = []

      const rows: Record<string, unknown>[] = []
      const duplicates: string[] = []

      for (const input of inputs) {
        const tag = input.assetTag?.trim() ?? ''
        if (tag && takenTags.has(tagKey(tag))) {
          duplicates.push(tag)
          continue
        }

        const category = categoryById.get(input.categoryId)
        if (!category) throw new Error(`Unknown category: ${input.categoryId}`)

        // Learn rooms and people here, exactly as the localStorage adapter does.
        let locationId = input.locationId?.trim() || null
        const locationText = input.locationName?.trim()
        if (!locationId && locationText) {
          const key = roomKey(locationText)
          const match = locationByKey.get(key)
          if (match) {
            locationId = match.id
          } else {
            const created: LocationRow = {
              id: `loc-${crypto.randomUUID().slice(0, 8)}`,
              name: locationText,
              room_number: locationText.match(/\d+/)?.[0] ?? null,
              floor: null,
            }
            locationByKey.set(key, created)
            newLocationRows.push(created)
            newLocations.push(created.name)
            locationId = created.id
          }
        }

        const holderText = input.assignedTo?.trim() || null
        let assignedTo: string | null = holderText
        if (holderText) {
          const key = nameKey(holderText)
          const match = staffByKey.get(key)
          if (match) {
            assignedTo = match.name
          } else {
            const created: StaffRow = {
              id: `stf-${crypto.randomUUID().slice(0, 8)}`,
              name: holderText,
              role: null,
            }
            staffByKey.set(key, created)
            newStaffRows.push(created)
            newStaff.push(created.name)
            assignedTo = created.name
          }
        }

        if (tag) takenTags.add(tagKey(tag))
        rows.push({
          tracking_type: category.trackingType,
          category_id: category.id,
          brand: input.brand.trim(),
          model: input.model.trim(),
          asset_tag: tag || null,
          serial: input.serial?.trim() || null,
          location_id: locationId,
          assigned_to: assignedTo,
          status: input.status ?? 'In Service',
          warranty_start: input.warrantyStart || null,
          warranty_end: input.warrantyEnd || null,
          purchase_date: input.purchaseDate || null,
          vendor: input.vendor || null,
          notes: input.notes || null,
          photo_url: input.photoUrl || null,
        })
      }

      if (newLocationRows.length > 0) {
        const { error } = await client.from('locations').insert(newLocationRows)
        if (error && error.code !== '23505') throw new Error(error.message)
      }
      if (newStaffRows.length > 0) {
        const { error } = await client.from('staff').insert(newStaffRows)
        if (error && error.code !== '23505') throw new Error(error.message)
      }

      const inserted = await insertDevices(rows)
      invalidate()

      return {
        created: inserted.created,
        duplicates: [...duplicates, ...inserted.duplicates],
        newLocations,
        newStaff,
      }
    },

    async listCategories(): Promise<Category[]> {
      return listCategoriesRaw()
    },

    async listLocations(): Promise<Location[]> {
      const rows = await listLocationsRaw()
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        roomNumber: row.room_number,
        floor: row.floor,
      }))
    },

    async listStaff(): Promise<Staff[]> {
      const rows = await listStaffRaw()
      return rows.map((row) => ({ id: row.id, name: row.name, role: row.role }))
    },

    async listBulkItems(): Promise<BulkItem[]> {
      const { data, error } = await client.from('bulk_items').select('*')
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as Array<{
        id: string
        category_id: string
        quantity: number
        location_id: string | null
        notes: string | null
        updated_at: string
      }>
      return rows.map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        quantity: row.quantity,
        locationId: row.location_id,
        notes: row.notes,
        updatedAt: row.updated_at,
      }))
    },

    async warrantySummary(now: Date = new Date()): Promise<Record<WarrantyBucket, number>> {
      const summary = Object.fromEntries(
        WARRANTY_BUCKETS.map((bucket) => [bucket, 0]),
      ) as Record<WarrantyBucket, number>

      const rows = await loadRows()
      for (const row of rows) {
        if (row.deleted_at || isRetired(row.status)) continue
        summary[warrantyBucket(row.warranty_end, now)] += 1
      }
      return summary
    },

    async reset(): Promise<void> {
      // Deliberately unavailable against a real database: wiping a live
      // inventory must not be one stray click in a footer. The UI hides the
      // button when a backend is configured.
      throw new Error('Reset is only available for local demo data.')
    },
  }
}
