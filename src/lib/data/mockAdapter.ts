import { NOW } from '../clock'
import type { BulkItem, Category, Device, InventorySnapshot, Location, Staff } from '../types'
import { isRetired } from '../types'
import type { WarrantyBucket } from '../warranty'
import { WARRANTY_BUCKETS, warrantyBucket } from '../warranty'
import { isDemoBuild } from '../demo'
import { nameKey, roomKey } from '../reference'
import { createDemoSnapshot } from './demoSeed'
import { createSeedSnapshot } from './seed'
import type { DeviceQuery, ImportOutcome, InventoryAdapter, NewDeviceInput } from './types'

/**
 * localStorage-backed implementation of `InventoryAdapter`.
 *
 * This exists so the whole UI can be built, clicked through and used before the
 * Supabase project exists. Everything is async and goes through the interface,
 * so the swap later is a one-line change in `data/index.ts`.
 *
 * v2: the demo fleet was removed, so anything still holding the old seeded
 * snapshot starts blank instead of showing 64 fake devices. Nothing real is
 * lost by the bump — the old key only ever held generated rows.
 *
 * v3: the preset room and staff lists were removed too, and they live inside
 * the snapshot. A v2 snapshot would keep showing the old placeholder rooms and
 * people, so the key moves once more. v2 only ever held demo/test rows.
 */

// The demo uses its own key so a showcase visit can never mix with whatever a
// developer has in the same browser on localhost.
const STORAGE_KEY = isDemoBuild ? 'x211:demo:v1' : 'x211:inventory:v3'
const LATENCY_MS = 60

/** Demo builds open on an invented fleet; the real app opens blank. */
const initialSnapshot = isDemoBuild ? createDemoSnapshot : createSeedSnapshot

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isValidSnapshot(value: unknown): value is InventorySnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<InventorySnapshot>
  return (
    Array.isArray(candidate.devices) &&
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.locations) &&
    Array.isArray(candidate.bulkItems)
  )
}

function persist(snapshot: InventorySnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Private browsing / storage disabled — the in-memory copy still works.
  }
}

/** Snapshots written before a field existed get a sane default on read. */
function normalise(snapshot: InventorySnapshot): InventorySnapshot {
  return {
    ...snapshot,
    devices: snapshot.devices.map((device) => ({ ...device, deletedAt: device.deletedAt ?? null })),
    // The 36-month laptop category used to be “Lenovo Laptop”. Renaming the
    // seed is not enough for a browser that already stored a snapshot — and
    // bumping the key again would throw away real records — so the old label is
    // rewritten on read instead. The id never changes, so devices are untouched.
    categories: snapshot.categories.map((category) =>
      category.id === 'cat-laptop' && category.name === 'Lenovo Laptop'
        ? { ...category, name: 'Windows Laptop' }
        : category,
    ),
  }
}

function load(): InventorySnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isValidSnapshot(parsed)) return normalise(parsed)
    }
  } catch {
    // Corrupt or unreadable payload — fall through and re-seed.
  }
  const seeded = initialSnapshot()
  persist(seeded)
  return seeded
}

/** Flattens a device plus its joined names into one lowercase search string. */
function haystack(
  device: Device,
  categories: Map<string, Category>,
  locations: Map<string, Location>,
): string {
  const location = device.locationId ? locations.get(device.locationId) : undefined
  return [
    device.assetTag,
    device.serial,
    device.brand,
    device.model,
    device.status,
    device.assignedTo,
    device.vendor,
    device.notes,
    categories.get(device.categoryId)?.name,
    location?.name,
    location?.roomNumber,
    location?.floor,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLowerCase()
}

/** Empty strings from a form or a spreadsheet cell mean "not recorded". */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Asset tags are compared case-insensitively — X211-1050 and x211-1050 are the same tag. */
function tagKey(tag: string): string {
  return tag.trim().toUpperCase()
}

function referenceId(prefix: string, key: string): string {
  const stem = key.slice(0, 24) || Math.random().toString(16).slice(2, 8)
  return `${prefix}-${stem}`
}

function newDeviceId(): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10)
  return `dev-${suffix}`
}

/** Every whitespace-separated token must match, so "chromebook 214" narrows. */
function matchesSearch(needle: string, hay: string): boolean {
  return needle
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token))
}

export function createMockAdapter(): InventoryAdapter {
  let snapshot = load()

  const categoryMap = (): Map<string, Category> =>
    new Map(snapshot.categories.map((category) => [category.id, category]))
  const locationMap = (): Map<string, Location> =>
    new Map(snapshot.locations.map((location) => [location.id, location]))

  const tagsInUse = (): Set<string> =>
    new Set(
      snapshot.devices
        .map((device) => device.assetTag)
        .filter((tag): tag is string => Boolean(tag))
        .map(tagKey),
    )

  /**
   * Finds or creates a room from raw sheet text. The list starts empty, so the
   * first import is what fills it — that is the point: real rooms come from real
   * data, not from a setup screen nobody fills in.
   */
  const ensureLocation = (raw: string): Location => {
    const name = raw.trim()
    const key = roomKey(name)
    const match = snapshot.locations.find(
      (location) =>
        roomKey(location.name) === key ||
        (location.roomNumber !== null && roomKey(location.roomNumber) === key),
    )
    if (match) return match

    let id = referenceId('loc', key)
    if (snapshot.locations.some((location) => location.id === id)) {
      id = `${id}-${snapshot.locations.length + 1}`
    }
    const created: Location = {
      id,
      name,
      // “Room 214” and “214” both yield a room number, so search and the
      // duplicates check work whichever way the sheet writes it.
      roomNumber: name.match(/\d+/)?.[0] ?? null,
      floor: null,
    }
    snapshot = { ...snapshot, locations: [...snapshot.locations, created] }
    return created
  }

  /** Same for a holder: a name the app has not seen becomes a staff entry. */
  const ensureStaff = (raw: string): Staff => {
    const name = raw.trim()
    const key = nameKey(name)
    const match = snapshot.staff.find((person) => nameKey(person.name) === key)
    if (match) return match

    let id = referenceId('stf', key)
    if (snapshot.staff.some((person) => person.id === id)) {
      id = `${id}-${snapshot.staff.length + 1}`
    }
    const created: Staff = { id, name, role: null }
    snapshot = { ...snapshot, staff: [...snapshot.staff, created] }
    return created
  }

  /** Shared by create and import so both build records the same way. */
  const build = (input: NewDeviceInput): Device => {
    const category = categoryMap().get(input.categoryId)
    if (!category) throw new Error(`Unknown category: ${input.categoryId}`)
    const today = new Date().toISOString().slice(0, 10)
    return {
      id: newDeviceId(),
      trackingType: category.trackingType,
      categoryId: category.id,
      brand: input.brand.trim(),
      model: input.model.trim(),
      assetTag: clean(input.assetTag),
      serial: clean(input.serial),
      locationId: clean(input.locationId),
      assignedTo: clean(input.assignedTo),
      status: input.status ?? 'In Service',
      warrantyStart: clean(input.warrantyStart),
      warrantyEnd: clean(input.warrantyEnd),
      purchaseDate: clean(input.purchaseDate),
      vendor: clean(input.vendor),
      notes: clean(input.notes),
      photoUrl: clean(input.photoUrl),
      createdAt: today,
      updatedAt: today,
      deletedAt: null,
    }
  }

  return {
    async listDevices(query: DeviceQuery = {}, now: Date = NOW): Promise<Device[]> {
      await delay(LATENCY_MS)
      const categories = categoryMap()
      const locations = locationMap()

      return snapshot.devices.filter((device) => {
        if (!query.includeDeleted && device.deletedAt) return false
        if (!query.includeRetired && isRetired(device.status)) return false
        if (query.statuses?.length && !query.statuses.includes(device.status)) return false
        if (query.categoryId && device.categoryId !== query.categoryId) return false
        if (query.locationId && device.locationId !== query.locationId) return false
        if (query.warrantyBuckets?.length) {
          const bucket = warrantyBucket(device.warrantyEnd, now)
          if (!query.warrantyBuckets.includes(bucket)) return false
        }
        if (query.search && !matchesSearch(query.search, haystack(device, categories, locations))) {
          return false
        }
        return true
      })
    },

    async getDevice(id: string): Promise<Device | null> {
      await delay(LATENCY_MS)
      return snapshot.devices.find((device) => device.id === id) ?? null
    },

    async updateDevice(id: string, patch: Partial<Device>): Promise<Device> {
      await delay(LATENCY_MS)
      const index = snapshot.devices.findIndex((device) => device.id === id)
      if (index === -1) throw new Error(`No device with id ${id}`)
      const updated: Device = {
        ...(snapshot.devices[index] as Device),
        ...patch,
        id,
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      snapshot = {
        ...snapshot,
        devices: snapshot.devices.map((device, i) => (i === index ? updated : device)),
      }
      persist(snapshot)
      return updated
    },

    async updateDevices(ids: readonly string[], patch: Partial<Device>): Promise<Device[]> {
      await delay(LATENCY_MS)
      const targets = new Set(ids)
      const updatedAt = new Date().toISOString().slice(0, 10)
      const updated: Device[] = []

      snapshot = {
        ...snapshot,
        devices: snapshot.devices.map((device) => {
          if (!targets.has(device.id)) return device
          const next: Device = { ...device, ...patch, id: device.id, updatedAt }
          updated.push(next)
          return next
        }),
      }
      persist(snapshot)
      return updated
    },

    async deleteDevice(id: string): Promise<Device> {
      await delay(LATENCY_MS)
      const index = snapshot.devices.findIndex((device) => device.id === id)
      if (index === -1) throw new Error(`No device with id ${id}`)
      const removed: Device = {
        ...(snapshot.devices[index] as Device),
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      snapshot = {
        ...snapshot,
        devices: snapshot.devices.map((device, i) => (i === index ? removed : device)),
      }
      persist(snapshot)
      return removed
    },

    async deleteDevices(ids: readonly string[]): Promise<Device[]> {
      await delay(LATENCY_MS)
      if (ids.length === 0) return []
      const targets = new Set(ids)
      const stamp = new Date().toISOString()
      const updatedAt = stamp.slice(0, 10)
      const removed: Device[] = []
      snapshot = {
        ...snapshot,
        devices: snapshot.devices.map((device) => {
          if (!targets.has(device.id)) return device
          const next: Device = { ...device, deletedAt: stamp, updatedAt }
          removed.push(next)
          return next
        }),
      }
      if (removed.length > 0) persist(snapshot)
      return removed
    },

    async restoreDevice(id: string): Promise<Device> {
      await delay(LATENCY_MS)
      const index = snapshot.devices.findIndex((device) => device.id === id)
      if (index === -1) throw new Error(`No device with id ${id}`)
      const restored: Device = {
        ...(snapshot.devices[index] as Device),
        deletedAt: null,
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      snapshot = {
        ...snapshot,
        devices: snapshot.devices.map((device, i) => (i === index ? restored : device)),
      }
      persist(snapshot)
      return restored
    },

    async listDeletedDevices(): Promise<Device[]> {
      await delay(LATENCY_MS)
      return snapshot.devices
        .filter((device) => device.deletedAt)
        .sort((a, b) => (a.deletedAt ?? '').localeCompare(b.deletedAt ?? ''))
        .reverse()
    },

    async purgeDevice(id: string): Promise<void> {
      await delay(LATENCY_MS)
      const device = snapshot.devices.find((item) => item.id === id)
      if (!device) throw new Error(`No device with id ${id}`)
      // Two-step on purpose: only something already removed can be erased.
      if (!device.deletedAt) throw new Error('Remove the device before erasing it permanently.')
      snapshot = { ...snapshot, devices: snapshot.devices.filter((item) => item.id !== id) }
      persist(snapshot)
    },

    async createDevice(input: NewDeviceInput): Promise<Device> {
      await delay(LATENCY_MS)
      const tag = clean(input.assetTag)
      if (tag && tagsInUse().has(tagKey(tag))) {
        throw new Error(`Asset tag ${tag} is already on another device.`)
      }
      const device = build(input)
      snapshot = { ...snapshot, devices: [...snapshot.devices, device] }
      persist(snapshot)
      return device
    },

    async importDevices(inputs: readonly NewDeviceInput[]): Promise<ImportOutcome> {
      await delay(LATENCY_MS)
      const taken = tagsInUse()
      const created: Device[] = []
      const duplicates: string[] = []
      const before = { locations: snapshot.locations.length, staff: snapshot.staff.length }

      for (const input of inputs) {
        const tag = clean(input.assetTag)
        if (tag && taken.has(tagKey(tag))) {
          duplicates.push(tag)
          continue
        }

        // Learn the room and the holder before building the row, so the
        // dropdowns on every screen list them as soon as this import lands.
        const locationName = clean(input.locationName)
        const locationId =
          clean(input.locationId) ?? (locationName ? ensureLocation(locationName).id : null)
        const holderName = clean(input.assignedTo)
        const holder = holderName ? ensureStaff(holderName) : null

        if (tag) taken.add(tagKey(tag))
        created.push(build({ ...input, locationId, assignedTo: holder?.name ?? input.assignedTo ?? null }))
      }

      if (created.length > 0) {
        snapshot = { ...snapshot, devices: [...snapshot.devices, ...created] }
        persist(snapshot)
      }
      return {
        created,
        duplicates,
        newLocations: snapshot.locations.slice(before.locations).map((location) => location.name),
        newStaff: snapshot.staff.slice(before.staff).map((person) => person.name),
      }
    },

    async listCategories(): Promise<Category[]> {
      await delay(LATENCY_MS)
      return [...snapshot.categories]
    },

    async listLocations(): Promise<Location[]> {
      await delay(LATENCY_MS)
      return [...snapshot.locations]
    },

    async listStaff(): Promise<Staff[]> {
      await delay(LATENCY_MS)
      return [...snapshot.staff]
    },

    async listBulkItems(): Promise<BulkItem[]> {
      await delay(LATENCY_MS)
      return [...snapshot.bulkItems]
    },

    async warrantySummary(now: Date = NOW): Promise<Record<WarrantyBucket, number>> {
      await delay(LATENCY_MS)
      const summary = Object.fromEntries(
        WARRANTY_BUCKETS.map((bucket) => [bucket, 0]),
      ) as Record<WarrantyBucket, number>

      for (const device of snapshot.devices) {
        // Retired units are history, not something left to act on, so the
        // dashboard counts only the fleet still in play. Removed records are
        // not even history — they are excluded everywhere.
        if (device.deletedAt || isRetired(device.status)) continue
        summary[warrantyBucket(device.warrantyEnd, now)] += 1
      }
      return summary
    },

    async reset(): Promise<void> {
      await delay(LATENCY_MS)
      snapshot = initialSnapshot()
      persist(snapshot)
    },
  }
}
