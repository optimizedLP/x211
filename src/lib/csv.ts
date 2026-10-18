/**
 * Minimal RFC 4180 reader for the import screen.
 *
 * Deliberately hand-written rather than a dependency: the app already ships
 * nothing beyond React, and the rules that matter here (quoted fields, escaped
 * quotes, CRLF, and the BOM Excel prepends) are about forty lines. It also
 * means the parser can be read and corrected by whoever inherits this.
 */

export type Delimiter = ',' | ';' | '\t'

export const DELIMITER_LABELS: Record<Delimiter, string> = {
  ',': 'comma',
  ';': 'semicolon',
  '\t': 'tab',
}

export interface ParsedTable {
  /** Column names, unique and non-empty. */
  headers: string[]
  /** Body rows, one entry per source row. Never includes the header row. */
  rows: string[][]
  delimiter: Delimiter
  /** False when the file had no usable header row and names were generated. */
  hasHeaderRow: boolean
}

/** Splits delimited text into rows of fields. Fully blank lines are dropped. */
export function parseDelimited(text: string, delimiter: Delimiter): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const endRow = () => {
    row.push(field)
    field = ''
    // A line of nothing but separators or whitespace is noise from Excel's
    // trailing rows, not a device.
    if (row.some((cell) => cell.trim() !== '')) rows.push(row)
    row = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] as string

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field.trim() === '') {
      // Excel sometimes writes ` "value"`; treat the quote as an opener anyway.
      field = ''
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\r') {
      if (input[index + 1] === '\n') index += 1
      endRow()
      continue
    }
    if (char === '\n') {
      endRow()
      continue
    }
    field += char
  }

  // Trailing newline: don't invent an empty final row.
  if (field !== '' || row.length > 0) endRow()
  return rows
}

/** Picks whichever separator appears most often on the first few lines. */
export function sniffDelimiter(text: string): Delimiter {
  const candidates: Delimiter[] = [',', ';', '\t']
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n')

  let best: Delimiter = ','
  let bestCount = 0
  for (const candidate of candidates) {
    // Count every field on every sampled line: headers occasionally contain the
    // wrong separator (a comma inside a quoted label), but the body does not.
    const count = parseDelimited(sample, candidate).reduce((total, row) => total + row.length, 0)
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

function uniqueHeaders(raw: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((value, index) => {
    const base = value.trim() || `Column ${index + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base} (${count + 1})`
  })
}

export function buildTable(text: string, hasHeaderRow: boolean, delimiter?: Delimiter): ParsedTable {
  const resolved = delimiter ?? sniffDelimiter(text)
  const raw = parseDelimited(text, resolved)
  if (raw.length === 0) {
    return { headers: [], rows: [], delimiter: resolved, hasHeaderRow }
  }

  const first = raw[0] as string[]
  if (hasHeaderRow) {
    return {
      headers: uniqueHeaders(first),
      rows: raw.slice(1),
      delimiter: resolved,
      hasHeaderRow: true,
    }
  }

  const width = Math.max(...raw.map((row) => row.length))
  return {
    headers: Array.from({ length: width }, (_, index) => `Column ${index + 1}`),
    rows: raw,
    delimiter: resolved,
    hasHeaderRow: false,
  }
}
