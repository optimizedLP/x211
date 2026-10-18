import type {
  BulkItem,
  Category,
  Device,
  DeviceStatus,
  InventorySnapshot,
  Location,
  Staff,
} from '../types'
import { addMonths, toIsoDate } from '../warranty'

/**
 * Demo fleet used until the real backend exists.
 *
 * Generated from a fixed PRNG seed, so every install gets the same fleet and
 * screenshots stay stable. Warranty dates are placed relative to the moment of
 * first load, which guarantees the 30/60/90-day dashboard tiles have something
 * real in them on day one.
 *
 * No student names anywhere — holders are staff only (FERPA safety rail from
 * section 3 of the handoff notes).
 */

// --- deterministic randomness -------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T
}

function chance(rng: () => number, probability: number): boolean {
  return rng() < probability
}

function pickWeighted<T extends string>(
  rng: () => number,
  entries: readonly (readonly [T, number])[],
): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll <= 0) return value
  }
  return entries[entries.length - 1]![0]
}

const SERIAL_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'

function makeSerial(rng: () => number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) out += SERIAL_CHARS[randInt(rng, 0, SERIAL_CHARS.length - 1)]
  return out
}

// --- catalog ------------------------------------------------------------------

interface CatalogEntry {
  category: Category
  models: readonly { brand: string; model: string }[]
}

const CATALOG: readonly CatalogEntry[] = [
  {
    category: { id: 'cat-laptop', name: 'Lenovo Laptop', defaultWarrantyMonths: 36, trackingType: 'serialized' },
    models: [
      { brand: 'Lenovo', model: 'ThinkPad T14 Gen 3' },
      { brand: 'Lenovo', model: 'ThinkPad E14 Gen 4' },
      { brand: 'Lenovo', model: 'ThinkPad L13 Yoga Gen 3' },
    ],
  },
  {
    category: { id: 'cat-chromebook', name: 'Chromebook', defaultWarrantyMonths: 12, trackingType: 'serialized' },
    models: [
      { brand: 'Acer', model: 'Chromebook 314 C736' },
      { brand: 'Dell', model: 'Chromebook 3110' },
      { brand: 'Lenovo', model: '100e Gen 4' },
      { brand: 'HP', model: 'Chromebook 11 G9 EE' },
    ],
  },
  {
    category: { id: 'cat-ipad', name: 'iPad', defaultWarrantyMonths: 12, trackingType: 'serialized' },
    models: [
      { brand: 'Apple', model: 'iPad (9th gen)' },
      { brand: 'Apple', model: 'iPad (10th gen)' },
      { brand: 'Apple', model: 'iPad Air (5th gen)' },
    ],
  },
  {
    category: { id: 'cat-monitor', name: 'Monitor', defaultWarrantyMonths: 36, trackingType: 'serialized' },
    models: [
      { brand: 'Dell', model: 'P2422H 24"' },
      { brand: 'ViewSonic', model: 'VA2447-MH' },
      { brand: 'HP', model: 'P22h G5' },
    ],
  },
  {
    category: { id: 'cat-printer', name: 'Printer', defaultWarrantyMonths: 36, trackingType: 'serialized' },
    models: [
      { brand: 'HP', model: 'LaserJet Pro M404dn' },
      { brand: 'Brother', model: 'HL-L2350DW' },
      { brand: 'Ricoh', model: 'SP 230DNw' },
    ],
  },
  {
    category: { id: 'cat-charger', name: 'Charger', defaultWarrantyMonths: 12, trackingType: 'bulk' },
    models: [],
  },
  {
    category: { id: 'cat-keyboard', name: 'Keyboard', defaultWarrantyMonths: 12, trackingType: 'bulk' },
    models: [],
  },
  {
    category: { id: 'cat-mouse', name: 'Mouse', defaultWarrantyMonths: 12, trackingType: 'bulk' },
    models: [],
  },
  {
    category: { id: 'cat-cable', name: 'Cable', defaultWarrantyMonths: 12, trackingType: 'bulk' },
    models: [],
  },
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

const VENDORS = ['CDW-G', 'SHI', 'NYC DOE Central Store', 'B&H Photo', 'TigerDirect'] as const

const NOTES = [
  'Screen cracked, awaiting parts quote.',
  'Battery swelling — flagged to DIIT.',
  'Label missing at intake; tag applied on site.',
  'Loaner unit, swap back after repair.',
  'Warranty paperwork not on file.',
  'Keyboard deck worn, still serviceable.',
  'Charging port loose.',
  'Cart 3, front-left slot.',
  'Screen replaced under warranty.',
  'Fan noisy under load.',
  null,
  null,
  null,
  null,
] as const

/** Where a device sits relative to today; drives which bucket it lands in. */
type WarrantyPlan = 'expired' | 'd30' | 'd60' | 'd90' | 'ok' | 'unknown'

const STATUS_WEIGHTS: readonly (readonly [DeviceStatus, number])[] = [
  ['In Service', 62],
  ['Needs Repair', 8],
  ['In Repair', 6],
  ['Repair Denied', 4],
  ['Out of Warranty', 8],
  ['Obsolete', 5],
  ['Pending Pickup', 3],
  ['Disposed', 4],
]

const WARRANTY_WEIGHTS: readonly (readonly [WarrantyPlan, number])[] = [
  ['expired', 12],
  ['d30', 9],
  ['d60', 8],
  ['d90', 8],
  ['ok', 53],
  ['unknown', 10],
]

function isoOffset(now: Date, days: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

function choosePlan(rng: () => number, status: DeviceStatus): WarrantyPlan {
  // Retired devices are retired precisely because the warranty ran out.
  if (status === 'Obsolete' || status === 'Pending Pickup' || status === 'Disposed') return 'expired'
  if (status === 'Out of Warranty' || status === 'Repair Denied') return 'expired'
  return pickWeighted(rng, WARRANTY_WEIGHTS)
}

/**
 * Warranty length comes from the category, so a Chromebook gets 12 months and a
 * ThinkPad 36. A device can only still be in warranty if it was purchased
 * recently enough, which is why the future offsets are capped.
 */
function resolveWarranty(
  rng: () => number,
  now: Date,
  months: number,
  plan: WarrantyPlan,
): { warrantyStart: string | null; warrantyEnd: string | null } {
  if (plan === 'unknown') return { warrantyStart: null, warrantyEnd: null }

  const maxFutureOffset = months * 30 - 5
  let offset: number
  switch (plan) {
    case 'expired':
      offset = randInt(rng, -months * 30 - 700, -5)
      break
    case 'd30':
      offset = randInt(rng, 0, 30)
      break
    case 'd60':
      offset = randInt(rng, 31, 60)
      break
    case 'd90':
      offset = randInt(rng, 61, 90)
      break
    case 'ok':
      offset = randInt(rng, 91, Math.max(120, maxFutureOffset))
      break
  }

  const warrantyEnd = isoOffset(now, offset)
  return { warrantyStart: addMonths(warrantyEnd, -months), warrantyEnd }
}

// --- snapshot -----------------------------------------------------------------

export function createSeedSnapshot(now: Date = new Date()): InventorySnapshot {
  const rng = mulberry32(0x211101)
  const devices: Device[] = []

  let assetCounter = 1041
  let serialCounter = 0

  for (let i = 0; i < 64; i += 1) {
    const entry = pick(rng, CATALOG.filter((c) => c.category.trackingType === 'serialized'))
    const { brand, model } = pick(rng, entry.models)
    const months = entry.category.defaultWarrantyMonths
    const status = pickWeighted(rng, STATUS_WEIGHTS)
    const plan = choosePlan(rng, status)
    const { warrantyStart, warrantyEnd } = resolveWarranty(rng, now, months, plan)

    // A real share of the fleet carries no identifying label at all — that is
    // the problem this whole app exists to fix.
    const labelState = rng()
    const assetTag = labelState < 0.12 ? null : `X211-${assetCounter}`
    if (assetTag) assetCounter += 1
    serialCounter += 1
    const serial = labelState < 0.12 ? null : makeSerial(rng, serialCounter % 3 === 0 ? 10 : 8)

    const location = pick(rng, LOCATIONS)
    const retired = status === 'Obsolete' || status === 'Pending Pickup' || status === 'Disposed'

    devices.push({
      id: `dev-${String(i + 1).padStart(3, '0')}`,
      trackingType: 'serialized',
      categoryId: entry.category.id,
      brand,
      model,
      assetTag,
      serial,
      locationId: status === 'Disposed' ? 'loc-storage' : location.id,
      assignedTo: retired ? null : chance(rng, 0.75) ? pick(rng, STAFF).name : null,
      status,
      warrantyStart,
      warrantyEnd,
      purchaseDate: warrantyStart ?? isoOffset(now, -randInt(rng, 200, 1500)),
      vendor: pick(rng, VENDORS),
      notes: plan === 'unknown' ? 'Warranty paperwork not on file.' : pick(rng, NOTES),
      photoUrl: null,
      createdAt: isoOffset(now, -randInt(rng, 30, 720)),
      updatedAt: isoOffset(now, -randInt(rng, 0, 30)),
      deletedAt: null,
    })
  }

  const bulkItems: BulkItem[] = [
    { id: 'bulk-1', categoryId: 'cat-charger', quantity: 84, locationId: 'loc-storage', notes: 'Mixed USB-C and barrel. Bulk, unlabeled.', updatedAt: isoOffset(now, -6) },
    { id: 'bulk-2', categoryId: 'cat-charger', quantity: 22, locationId: 'loc-stem', notes: 'Chromebook chargers, cart 2.', updatedAt: isoOffset(now, -2) },
    { id: 'bulk-3', categoryId: 'cat-keyboard', quantity: 41, locationId: 'loc-storage', notes: null, updatedAt: isoOffset(now, -14) },
    { id: 'bulk-4', categoryId: 'cat-mouse', quantity: 57, locationId: 'loc-storage', notes: null, updatedAt: isoOffset(now, -14) },
    { id: 'bulk-5', categoryId: 'cat-cable', quantity: 130, locationId: 'loc-storage', notes: 'HDMI + Cat6 mixed in one bin.', updatedAt: isoOffset(now, -3) },
    { id: 'bulk-6', categoryId: 'cat-mouse', quantity: 12, locationId: 'loc-lib', notes: 'Spares for the library bank.', updatedAt: isoOffset(now, -9) },
  ]

  return {
    devices,
    categories: CATALOG.map((entry) => entry.category),
    locations: [...LOCATIONS],
    staff: [...STAFF],
    bulkItems,
  }
}
