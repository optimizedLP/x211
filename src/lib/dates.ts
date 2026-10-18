import { toIsoDate } from './warranty'

/**
 * Spreadsheet dates are the least standardised thing in the whole import: the
 * same Excel column can export as `2024-05-14`, `5/14/2024`, `5/14/24` or the
 * raw serial number 45426, depending on the machine that saved it. Normalising
 * is cheaper than asking the user to reformat their sheet, and anything that
 * cannot be understood is reported rather than guessed.
 */

const ISO_PATTERN = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/
const US_PATTERN = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/
const EXCEL_SERIAL_PATTERN = /^\d{5}(?:\.\d+)?$/

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  // Rejects 2/30 and friends, which the Date constructor would roll forward.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return toIsoDate(date)
}

/**
 * Returns an ISO `YYYY-MM-DD` date, or null when the cell is blank or cannot be
 * read. Callers treat blank and unreadable differently — one is normal, the
 * other is worth telling the user about.
 */
export function parseDateCell(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  const iso = ISO_PATTERN.exec(value)
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const us = US_PATTERN.exec(value)
  if (us) {
    const rawYear = Number(us[3])
    const year = us[3]!.length === 2 ? (rawYear < 70 ? 2000 + rawYear : 1900 + rawYear) : rawYear
    return isoFromParts(year, Number(us[1]), Number(us[2]))
  }

  // Excel epoch is 1899-12-30, which is why 1 is 1899-12-31 and 45426 is 2024-05-14.
  if (EXCEL_SERIAL_PATTERN.test(value)) {
    const days = Number(value)
    const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000)
    if (Number.isNaN(date.getTime())) return null
    return toIsoDate(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  }

  return null
}

export function todayIso(): string {
  return toIsoDate(new Date())
}
