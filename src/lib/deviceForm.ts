import type { NewDeviceInput } from './data/types'
import type { Device, DeviceStatus } from './types'

/**
 * The device field set, shared by the detail editor and the new-device form.
 *
 * Values are held as strings so an empty input means "not recorded" — several
 * fields are legitimately blank on the real fleet, and the difference between
 * "never recorded" and "recorded as empty" is not worth a tri-state control.
 */
export interface DeviceFormValues {
  assetTag: string
  serial: string
  categoryId: string
  brand: string
  model: string
  locationId: string
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
    locationId: '',
    assignedTo: '',
    status: 'In Service',
    warrantyStart: '',
    warrantyEnd: '',
    purchaseDate: '',
    vendor: '',
    notes: '',
  }
}

export function deviceToFormValues(device: Device): DeviceFormValues {
  return {
    assetTag: device.assetTag ?? '',
    serial: device.serial ?? '',
    categoryId: device.categoryId,
    brand: device.brand,
    model: device.model,
    locationId: device.locationId ?? '',
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
    assetTag: optional(form.assetTag),
    serial: optional(form.serial),
    locationId: optional(form.locationId),
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
  if (form.warrantyStart && form.warrantyEnd && form.warrantyEnd < form.warrantyStart) {
    return 'Warranty end cannot be earlier than warranty start.'
  }
  if (form.purchaseDate && form.warrantyEnd && form.warrantyEnd < form.purchaseDate) {
    return 'Warranty end cannot be earlier than the purchase date.'
  }
  return null
}

