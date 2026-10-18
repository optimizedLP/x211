import type { ParsedTable } from './csv'
import type { NewDeviceInput } from './data/types'
import { parseDateCell } from './dates'
import type { Category, Device, DeviceStatus, Location, Staff } from './types'
import { DEVICE_STATUSES } from './types'
import { addMonths } from './warranty'

/**
 * Turns a parsed spreadsheet into device records without writing anything.
 *
 * Every guess the importer makes is visible in the returned warnings, and every
 * problem is attached to the row that caused it. Nothing is written until the
 * user has seen the dry run — a misread serial is worse than no serial, because
 * it looks real.
 */

export type ImportFieldKey =
  | 'assetTag'
  | 'serial'
  | 'brand'
  | 'model'
  | 'category'
  | 'location'
  | 'holder'
  | 'status'
  | 'warrantyStart'
  | 'warrantyEnd'
  | 'purchaseDate'
  | 'vendor'
  | 'notes'

export interface ImportField {
  key: ImportFieldKey
  label: string
  /** Required fields block the import until a column is mapped to them. */
  required: boolean
  /** Lower-case header names this field recognises, before fuzzy matching. */
  hints: readonly string[]
  placeholder: string
}

/**
 * Order matters: the first field to match a column claims it, so narrower
 * names (asset tag) come before wider ones (notes).
 */
export const IMPORT_FIELDS: readonly ImportField[] = [
  {
    key: 'assetTag',
    label: 'Asset tag',
    required: false,
    hints: ['assettag', 'assettagid', 'assettagnumber', 'tag', 'tagid', 'devicetag', 'inventorytag', 'barcode'],
    placeholder: 'X211-1050',
  },
  {
    key: 'serial',
    label: 'Serial number',
    required: false,
    hints: ['serial', 'serialnumber', 'serialno', 'sn', 'servicetag', 'serialtag'],
    placeholder: 'PF3ABC12',
  },
  {
    key: 'category',
    label: 'Category',
    required: true,
    hints: ['category', 'devicetype', 'assettype', 'itemtype', 'type', 'kind'],
    placeholder: 'Chromebook',
  },
  {
    key: 'brand',
    label: 'Brand',
    required: true,
    hints: ['brand', 'manufacturer', 'make', 'mfr'],
    placeholder: 'Lenovo',
  },
  {
    key: 'model',
    label: 'Model',
    required: true,
    hints: ['model', 'modelnumber', 'modelno', 'devicemodel', 'product', 'description', 'itemdescription'],
    placeholder: 'ThinkPad T14 Gen 3',
  },
  {
    key: 'location',
    label: 'Location',
    required: false,
    hints: ['location', 'room', 'roomnumber', 'roomname', 'classroom', 'assignedroom', 'site', 'building'],
    placeholder: 'Room 214',
  },
  {
    key: 'holder',
    label: 'Holder',
    required: false,
    hints: ['holder', 'assignedto', 'assigned', 'owner', 'assigneduser', 'currentuser', 'staff', 'staffmember'],
    placeholder: 'M. Rivera',
  },
  {
    key: 'status',
    label: 'Status',
    required: false,
    hints: ['status', 'devicestatus', 'currentstatus', 'condition', 'state'],
    placeholder: 'In Service',
  },
  {
    key: 'purchaseDate',
    label: 'Purchase date',
    required: false,
    hints: ['purchasedate', 'datepurchased', 'dateofpurchase', 'acquisitiondate', 'invoicedate', 'purchased'],
    placeholder: '2024-08-30',
  },
  {
    key: 'warrantyStart',
    label: 'Warranty start',
    required: false,
    hints: ['warrantystart', 'warrantystartdate', 'warrantyfrom', 'warrantybegins', 'startdate'],
    placeholder: '2024-08-30',
  },
  {
    key: 'warrantyEnd',
    label: 'Warranty end',
    required: false,
    hints: [
      'warrantyend',
      'warrantyenddate',
      'warrantyexpiration',
      'warrantyexpiry',
      'warrantyexpires',
      'expirationdate',
      'expirydate',
      'warrantyuntil',
      'endofthewarranty',
      'endofwarranty',
    ],
    placeholder: '2027-08-30',
  },
  {
    key: 'vendor',
    label: 'Vendor',
    required: false,
    hints: ['vendor', 'supplier', 'reseller', 'seller', 'purchasedfrom'],
    placeholder: 'CDW-G',
  },
  {
    key: 'notes',
    label: 'Notes',
    required: false,
    hints: ['notes', 'note', 'comment', 'comments', 'remarks', 'memo'],
    placeholder: 'Cart 4, missing keys',
  },
]

export const UNMAPPED = -1

export type ImportMapping = Record<ImportFieldKey, number>

function headerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function emptyMapping(): ImportMapping {
  return Object.fromEntries(IMPORT_FIELDS.map((field) => [field.key, UNMAPPED])) as ImportMapping
}

/** Exact header matches first, then a conservative substring pass. */
export function suggestMapping(headers: readonly string[]): ImportMapping {
  const mapping = emptyMapping()
  const used = new Set<number>()

  for (const exact of [true, false]) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key] !== UNMAPPED) continue
      const hints = field.hints.map(headerKey)
      const index = headers.findIndex((header, column) => {
        if (used.has(column)) return false
        const candidate = headerKey(header)
        if (!candidate) return false
        if (exact) return hints.includes(candidate)
        // Short fragments like "id" or "date" would match half the sheet.
        return hints.some((hint) => hint.length >= 5 && (candidate.includes(hint) || hint.includes(candidate)))
      })
      if (index !== -1) {
        mapping[field.key] = index
        used.add(index)
      }
    }
  }

  return mapping
}

/** First non-empty value in a column, so the mapping screen can show a sample. */
export function columnSample(table: ParsedTable, column: number): string | null {
  if (column < 0) return null
  for (const row of table.rows) {
    const value = (row[column] ?? '').trim()
    if (value) return value
  }
  return null
}

const STATUS_ALIASES: Record<string, DeviceStatus> = {
  active: 'In Service',
  inuse: 'In Service',
  working: 'In Service',
  ok: 'In Service',
  broken: 'Needs Repair',
  damaged: 'Needs Repair',
  faulty: 'Needs Repair',
  beingrepaired: 'In Repair',
  atrepairshop: 'In Repair',
  denied: 'Repair Denied',
  retired: 'Obsolete',
  surplus: 'Pending Pickup',
  awaitingpickup: 'Pending Pickup',
  disposed: 'Disposed',
  trashed: 'Disposed',
}

function normaliseStatus(raw: string): DeviceStatus | null {
  const candidate = headerKey(raw)
  if (!candidate) return null
  const exact = DEVICE_STATUSES.find((status) => headerKey(status) === candidate)
  return exact ?? STATUS_ALIASES[candidate] ?? null
}

export interface ImportPlanRow {
  /** 1-based row number as it appears in the spreadsheet, header included. */
  rowNumber: number
  preview: {
    assetTag: string
    serial: string
    brand: string
    model: string
    category: string
    status: string
  }
  /** Null only when the category could not be resolved — otherwise filled in even for invalid rows. */
  input: NewDeviceInput | null
  errors: string[]
  warnings: string[]
}

export interface ImportPlan {
  rows: ImportPlanRow[]
  /** Rows that will be written. */
  ready: number
  rowsWithErrors: number
  rowsWithWarnings: number
  /** Header-level reasons the import cannot run yet. */
  blockers: string[]
}

export interface PlanArgs {
  table: ParsedTable
  mapping: ImportMapping
  /** Used for rows whose category cell is blank or unrecognised. */
  fallbackCategoryId: string
  categories: readonly Category[]
  locations: readonly Location[]
  staff: readonly Staff[]
  /** Existing records, retired included, so duplicate tags are caught. */
  existing: readonly Device[]
}

function addMonthsSafe(isoDate: string, months: number): string | null {
  if (!Number.isFinite(months) || months <= 0) return null
  return addMonths(isoDate, months)
}

export function buildImportPlan({
  table,
  mapping,
  fallbackCategoryId,
  categories,
  locations,
  staff,
  existing,
}: PlanArgs): ImportPlan {
  const serializedCategories = categories.filter((category) => category.trackingType === 'serialized')
  const categoryByKey = new Map<string, Category>()
  for (const category of serializedCategories) {
    categoryByKey.set(headerKey(category.name), category)
    categoryByKey.set(headerKey(category.id), category)
  }
  const fallbackCategory = categoryByKey.get(headerKey(fallbackCategoryId)) ?? null

  // Choosing a fallback category *is* the answer to "which category?", so a
  // sheet with no category column can still be imported — otherwise the picker
  // would offer a way out that the blocker list then refuses.
  const blockers = IMPORT_FIELDS.filter((field) => {
    if (!field.required) return false
    if (field.key === 'category' && fallbackCategory) return false
    return mapping[field.key] === UNMAPPED
  }).map((field) => `Map a column to ${field.label.toLowerCase()}.`)

  const locationByKey = new Map<string, Location>()
  for (const location of locations) {
    locationByKey.set(headerKey(location.name), location)
    if (location.roomNumber) {
      locationByKey.set(headerKey(location.roomNumber), location)
      locationByKey.set(headerKey(`${location.name} ${location.roomNumber}`), location)
      locationByKey.set(headerKey(`${location.roomNumber} ${location.name}`), location)
    }
  }

  const staffByKey = new Map<string, Staff>()
  for (const person of staff) {
    staffByKey.set(headerKey(person.name), person)
  }

  const tagsOnRecord = new Set(
    existing
      .map((device) => device.assetTag?.trim().toUpperCase())
      .filter((tag): tag is string => Boolean(tag)),
  )
  const serialsOnRecord = new Set(
    existing
      .map((device) => device.serial?.trim().toUpperCase())
      .filter((serial): serial is string => Boolean(serial)),
  )

  const seenTags = new Map<string, number>()
  const seenSerials = new Map<string, number>()

  const rows: ImportPlanRow[] = []
  const headerOffset = table.hasHeaderRow ? 2 : 1
  // A column that is not mapped at all means the user chose the fallback
  // globally; a blank cell inside a mapped column is per-row missing data and
  // is worth saying out loud.
  const categoryColumnMapped = mapping.category !== UNMAPPED

  table.rows.forEach((cells, index) => {
    const rowNumber = index + headerOffset
    const value = (field: ImportFieldKey): string => {
      const column = mapping[field]
      return column === UNMAPPED ? '' : (cells[column] ?? '').trim()
    }

    const assetTag = value('assetTag')
    const serial = value('serial')
    const brand = value('brand')
    const model = value('model')
    const categoryText = value('category')
    const locationText = value('location')
    const holderText = value('holder')
    const statusText = value('status')

    // A row with nothing in any mapped column is a stray spreadsheet artefact.
    const hasContent = IMPORT_FIELDS.some((field) => value(field.key) !== '')
    if (!hasContent) return

    const errors: string[] = []
    const warnings: string[] = []

    // --- category
    let category = categoryByKey.get(headerKey(categoryText)) ?? null
    if (!category && categoryText && fallbackCategory) {
      warnings.push(`Unknown category “${categoryText}” — imported as ${fallbackCategory.name}.`)
      category = fallbackCategory
    } else if (!category && !categoryText && fallbackCategory) {
      category = fallbackCategory
      if (categoryColumnMapped) {
        warnings.push(`Category is blank — imported as ${fallbackCategory.name}.`)
      }
    } else if (!category && categoryText) {
      errors.push(`Unknown category “${categoryText}”.`)
    } else if (!category) {
      errors.push('Category is blank.')
    }

    // --- brand / model
    if (!brand) errors.push('Brand is blank.')
    if (!model) errors.push('Model is blank.')

    // --- status
    let status: DeviceStatus = 'In Service'
    if (statusText) {
      const resolved = normaliseStatus(statusText)
      if (resolved) status = resolved
      else warnings.push(`Unknown status “${statusText}” — imported as In Service.`)
    }

    // --- dates
    const readDate = (field: ImportFieldKey, label: string): string | null => {
      const raw = value(field)
      if (!raw) return null
      const iso = parseDateCell(raw)
      if (!iso) errors.push(`${label} “${raw}” is not a date I can read.`)
      return iso
    }
    const warrantyStart = readDate('warrantyStart', 'Warranty start')
    const purchaseDate = readDate('purchaseDate', 'Purchase date')
    let warrantyEnd = readDate('warrantyEnd', 'Warranty end')

    if (!warrantyEnd && purchaseDate && category) {
      const derived = addMonthsSafe(purchaseDate, category.defaultWarrantyMonths)
      if (derived) {
        warrantyEnd = derived
        warnings.push(
          `Warranty end derived from the purchase date (${category.defaultWarrantyMonths}-month ${category.name} warranty).`,
        )
      }
    }

    if (warrantyStart && warrantyEnd && warrantyEnd < warrantyStart) {
      errors.push('Warranty end is before warranty start.')
    }
    if (purchaseDate && warrantyEnd && warrantyEnd < purchaseDate) {
      errors.push('Warranty end is before the purchase date.')
    }

    // --- asset tag uniqueness
    if (assetTag) {
      const tag = assetTag.toUpperCase()
      if (tagsOnRecord.has(tag)) {
        errors.push(`Asset tag ${assetTag} is already on record.`)
      }
      const earlier = seenTags.get(tag)
      if (earlier !== undefined) {
        errors.push(`Asset tag ${assetTag} also appears on row ${earlier}.`)
      } else {
        seenTags.set(tag, rowNumber)
      }
    }

    if (serial) {
      const key = serial.toUpperCase()
      if (serialsOnRecord.has(key)) {
        warnings.push(`Serial ${serial} is already on another device.`)
      }
      const earlier = seenSerials.get(key)
      if (earlier !== undefined) {
        warnings.push(`Serial ${serial} also appears on row ${earlier}.`)
      } else {
        seenSerials.set(key, rowNumber)
      }
    }

    // --- location / holder
    let locationId: string | null = null
    if (locationText) {
      const match = locationByKey.get(headerKey(locationText))
      if (match) locationId = match.id
      else warnings.push(`Location “${locationText}” is not in the location list — left blank.`)
    }

    const holder = holderText ? staffByKey.get(headerKey(holderText)) : undefined
    if (holderText && !holder) {
      warnings.push(`Holder “${holderText}” is not on the staff list — saved as free text.`)
    }

    rows.push({
      rowNumber,
      preview: {
        assetTag,
        serial,
        brand,
        model,
        category: category?.name ?? categoryText,
        status,
      },
      input: category
        ? {
            categoryId: category.id,
            brand,
            model,
            assetTag: assetTag || null,
            serial: serial || null,
            locationId,
            // Store the canonical staff name when we recognise it, the raw text otherwise.
            assignedTo: holder?.name ?? (holderText || null),
            status,
            warrantyStart,
            warrantyEnd,
            purchaseDate,
            vendor: value('vendor') || null,
            notes: value('notes') || null,
          }
        : null,
      errors,
      warnings,
    })
  })

  if (table.headers.length === 0) blockers.push('The file has no rows.')
  else if (rows.length === 0) blockers.push('No data rows found under the header.')

  return {
    rows,
    ready: rows.filter((row) => row.errors.length === 0 && row.input).length,
    rowsWithErrors: rows.filter((row) => row.errors.length > 0).length,
    rowsWithWarnings: rows.filter((row) => row.warnings.length > 0).length,
    blockers,
  }
}
