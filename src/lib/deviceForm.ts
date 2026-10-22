import type { NewDeviceInput } from './data/types'
import {
  MAX_IDENTIFIER_LENGTH,
  normalizeAssetTag,
  normalizeSerial,
} from './identifiers'
import type { Device, DeviceStatus, Location } from './types'

/**
 * The device field set, shared by the detail editor and the new-device form.
 *
 * Values are held as strings so an empty input means "not recorded" — several
 * fields are legitimately blank on the real fleet, and the difference between
 * "never recorded" and "recorded as empty" is not worth a tri-state control.
 *
 * Location and holder are free text: the inputs suggest existing rooms and
 * people but accept a new name, which the save path creates (same
 * find-or-create rules as the spreadsheet import).
 */
export interface DeviceFormValues {
  assetTag: string
  serial: string
  categoryId: string
  brand: string
  model: string
  /** Room display name, e.g. "Room 214" — blank means unassigned. */
  location: string
  /** Holder display name — blank means unassigned. */
  assignedTo: string
  status: DeviceStatus
  warrantyStart: string
  warrantyEnd: string
  purchaseDate: string
  vendor: string
  notes: string
}

export function blankDeviceForm(categoryId = ''): DeviceFormValues {
  return {
    assetTag: '',
    serial: '',
    categoryId,
    brand: '',
    model: '',
    location: '',
    assignedTo: '',
    status: 'In Service',
    warrantyStart: '',
    warrantyEnd: '',
    purchaseDate: '',
    vendor: '',
    notes: '',
  }
}

export function deviceToFormValues(
  device: Device,
  locations: readonly Location[] = [],
): DeviceFormValues {
  return {
    assetTag: device.assetTag ?? '',
    serial: device.serial ?? '',
    categoryId: device.categoryId,
    brand: device.brand,
    model: device.model,
    location: device.locationId
      ? (locations.find((item) => item.id === device.locationId)?.name ?? '')
      : '',
    assignedTo: device.assignedTo ?? '',
    status: device.status,
    warrantyStart: device.warrantyStart ?? '',
    warrantyEnd: device.warrantyEnd ?? '',
    purchaseDate: device.purchaseDate ?? '',
    vendor: device.vendor ?? '',
    notes: device.notes ?? '',
  }
}

function optional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Valid for both create and update — `Partial<Device>` accepts the same shape. */
export function formValuesToInput(form: DeviceFormValues): NewDeviceInput {
  return {
    categoryId: form.categoryId,
    brand: form.brand.trim(),
    model: form.model.trim(),
    // Keys are compared in this normalised form by every adapter, so a value
    // typed in lower case must not become a second record.
    assetTag: normalizeAssetTag(form.assetTag),
    serial: normalizeSerial(form.serial),
    // Free text: the adapter finds or creates the room, so picking a
    // suggestion reuses it and typing a new name adds it — same as import.
    locationName: optional(form.location),
    assignedTo: optional(form.assignedTo),
    status: form.status,
    warrantyStart: optional(form.warrantyStart),
    warrantyEnd: optional(form.warrantyEnd),
    purchaseDate: optional(form.purchaseDate),
    vendor: optional(form.vendor),
    notes: optional(form.notes),
  }
}

/** ISO dates compare correctly as strings, so no Date parsing is needed here. */
export function validateDeviceForm(form: DeviceFormValues): string | null {
  if (!form.brand.trim()) return 'Brand is required.'
  if (!form.categoryId) return 'Category is required.'
  // Length is a paste/scan guard, not a format rule — the fleet has serials
  // from 7 to 22 characters and older tags may differ from today's pattern.
  if ((normalizeAssetTag(form.assetTag)?.length ?? 0) > MAX_IDENTIFIER_LENGTH) {
    return 'Asset tag is too long — check for a stray character.'
  }
  if ((normalizeSerial(form.serial)?.length ?? 0) > MAX_IDENTIFIER_LENGTH) {
    return 'Serial number is too long — check for a stray character.'
  }
  if (form.warrantyStart && form.warrantyEnd && form.warrantyEnd < form.warrantyStart) {
    return 'Warranty end cannot be earlier than warranty start.'
  }
  if (form.purchaseDate && form.warrantyEnd && form.warrantyEnd < form.purchaseDate) {
    return 'Warranty end cannot be earlier than the purchase date.'
  }
  return null
}
