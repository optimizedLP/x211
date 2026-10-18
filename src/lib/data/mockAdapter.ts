import { NOW } from '../clock'
import type { BulkItem, Category, Device, InventorySnapshot, Location, Staff } from '../types'
import { isRetired } from '../types'
import type { WarrantyBucket } from '../warranty'
import { WARRANTY_BUCKETS, warrantyBucket } from '../warranty'
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
 */

const STORAGE_KEY = 'x211:inventory:v2'
const LATENCY_MS = 60

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
  const seeded = createSeedSnapshot()
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

      for (const input of inputs) {
        const tag = clean(input.assetTag)
        if (tag && taken.has(tagKey(tag))) {
          duplicates.push(tag)
          continue
        }
        if (tag) taken.add(tagKey(tag))
        created.push(build(input))
      }

      if (created.length > 0) {
        snapshot = { ...snapshot, devices: [...snapshot.devices, ...created] }
        persist(snapshot)
      }
      return { created, duplicates }
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
      snapshot = createSeedSnapshot()
      persist(snapshot)
    },
  }
}
