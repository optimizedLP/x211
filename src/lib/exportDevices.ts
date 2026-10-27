import type { Category, Device, Location } from './types'

/**
 * Export for the device list: CSV download + a print manifest.
 *
 * Both read from the rows already on screen (filtered + sorted), so what is
 * exported is always what the person sees — a status filter, a search, or the
 * whole fleet. No backend change: the caller passes the visible devices plus
 * the lookup maps it already has.
 */

/** Same column order as the import template, so export round-trips back in. */
export const EXPORT_HEADERS = [
  'Asset tag',
  'Serial',
  'Category',
  'Brand',
  'Location',
  'Holder',
  'Status',
  'Warranty end',
  'Notes',
  'Model',
] as const

function cell(value: string | null | undefined): string {
  return (value ?? '').trim()
}

export function deviceToExportRow(
  device: Device,
  categories: Map<string, Category>,
  locations: Map<string, Location>,
): string[] {
  return [
    cell(device.assetTag),
    cell(device.serial),
    cell(categories.get(device.categoryId)?.name),
    cell(device.brand),
    cell(device.locationId ? (locations.get(device.locationId)?.name ?? '') : ''),
    cell(device.assignedTo),
    cell(device.status),
    cell(device.warrantyEnd),
    cell(device.notes),
    cell(device.model),
  ]
}

function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function devicesToCsv(
  devices: readonly Device[],
  categories: Map<string, Category>,
  locations: Map<string, Location>,
): string {
  const lines = [
    [...EXPORT_HEADERS].map(escapeCsvCell).join(','),
    ...devices.map((device) =>
      deviceToExportRow(device, categories, locations).map(escapeCsvCell).join(','),
    ),
  ]
  return `${lines.join('\r\n')}\r\n`
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** e.g. x211-devices-2026-10-27.csv, or x211-devices-needs-repair-2026-10-27.csv. */
export function exportFilename(filterHint: string | null, today = new Date()): string {
  const month = `${today.getMonth() + 1}`.padStart(2, '0')
  const day = `${today.getDate()}`.padStart(2, '0')
  const date = `${today.getFullYear()}-${month}-${day}`
  const hint = filterHint ? slug(filterHint) : ''
  return hint ? `x211-devices-${hint}-${date}.csv` : `x211-devices-${date}.csv`
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke on the next tick so Safari finishes the download first.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
