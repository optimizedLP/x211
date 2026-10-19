import {
  MAX_IDENTIFIER_LENGTH,
  looksLikeAssetTag,
  looksLikeSerial,
  normalizeAssetTag,
  normalizeSerial,
} from '../identifiers'

/**
 * Pulls the asset tag and serial out of OCR text.
 *
 * The labels are uniform — `ASSET TAG: …` over a barcode, then `S/N: …`, then
 * `TYPE: …` — so this is anchored matching, not language understanding. That
 * matters: a wrong digit that looks plausible is worse than an empty field, so
 * anything uncertain is returned as null and the person types it.
 *
 * Tesseract puts fields on their own lines but occasionally splits a long
 * serial ("NXGP6AA00190508 AC27600") or leaves `S/N:` with the value on the
 * next line. Both are handled; the rest is left alone rather than guessed.
 */

export interface LabelRead {
  assetTag: string | null
  serial: string | null
}

/** Words that can follow a value on the same line — never part of it. */
const FIELD_WORDS = new Set([
  'ASSET',
  'TAG',
  'SERIAL',
  'TYPE',
  'MODEL',
  'PROPERTY',
  'DEPARTMENT',
  'EDUCATION',
  'NYC',
  'DOE',
  'DATE',
  'DEPT',
  'OF',
])

/**
 * The printed tag line, with the value possibly on the next line. Captures at
 * most one line's worth of characters, so it cannot run into the serial.
 */
const TAG_ANCHOR = /ASSET\s*TAG\s*[:#=]?\s*([A-Z0-9][A-Z0-9 -]{2,40})/

/** The DOE prefix is distinctive enough to accept without its label. */
const DOE_TAG = /\bDOE-LN[O0-9ILSBZ]{7}\b/

/** Any `ABC-1234`-shaped token; the TYPE code (`3554-A19`) starts with digits and cannot match. */
const HYPHENATED_TAG = /\b[A-Z]{2,5}-[A-Z0-9]{4,20}\b/g

/** `S/N`, `SN`, and the `SIN` that OCR sometimes produces for `S/N`. */
const SERIAL_ANCHOR = /\bS\s*[/\\|I]?\s*N\b\s*[:.;=]?/

function linesOf(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
}

/**
 * `DOE-LN` is followed by seven digits on every label seen so far. OCR reads
 * `0` as `O`, `1` as `I`/`L`, `5` as `S`, `8` as `B` and `2` as `Z` often enough
 * to be worth repairing — but only when the suffix is mostly digits already,
 * so a genuinely lettered tag is never rewritten.
 */
function repairTagDigits(tag: string): string {
  // PP-OCR reads the printed `DOE` prefix as `D0E` about half the time.
  const repaired = tag.replace(/^D[0O]E-/, 'DOE-')
  const match = /^DOE-LN([A-Z0-9]{7})$/.exec(repaired)
  if (!match) return repaired
  const suffix = match[1]
  if (suffix.replace(/[^0-9]/g, '').length < 4) return tag
  return `DOE-LN${suffix
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2')}`
}

function findTag(text: string): string | null {
  const anchor = TAG_ANCHOR.exec(text)
  if (anchor) {
    const first = anchor[1].trim().split(' ')[0]
    const tag = normalizeAssetTag(first)
    if (tag && looksLikeAssetTag(tag)) return repairTagDigits(tag)
  }

  const doe = DOE_TAG.exec(text)
  if (doe) {
    const tag = normalizeAssetTag(doe[0])
    if (tag) return repairTagDigits(tag)
  }

  for (const candidate of text.match(HYPHENATED_TAG) ?? []) {
    const tag = normalizeAssetTag(candidate)
    if (tag && looksLikeAssetTag(tag)) return repairTagDigits(tag)
  }

  return null
}

/**
 * Reads the value that follows an anchor on its line. When the line ends at
 * the anchor, the next non-empty line is used — that is where OCR usually puts
 * the serial when the label is tight.
 */
function valueAfterAnchor(lines: string[], index: number, matchEnd: number): string | null {
  const rest = lines[index]?.slice(matchEnd).trim() ?? ''
  const source = rest.length > 0 ? rest : (lines.slice(index + 1).find((line) => line.length > 0) ?? '')
  if (!source) return null

  const tokens = source.split(' ').filter(Boolean).slice(0, 3)
  let value = ''
  for (const token of tokens) {
    const piece = token.replace(/[^A-Z0-9]/g, '')
    if (!piece || FIELD_WORDS.has(piece)) break
    // OCR often glues the next field to the value — `MJ27TBK Type:3554-A19`
    // arrives as one token, so the check has to look at the start.
    if (FIELD_WORDS.has(piece.match(/^[A-Z]+/)?.[0] ?? '')) break
    if (value.length + piece.length > MAX_IDENTIFIER_LENGTH) break
    value += piece
  }

  const serial = normalizeSerial(value)
  return serial && looksLikeSerial(serial) ? serial : null
}

function findSerial(text: string): string | null {
  const lines = linesOf(text)
  for (let index = 0; index < lines.length; index += 1) {
    const match = SERIAL_ANCHOR.exec(lines[index] ?? '')
    if (!match) continue
    const serial = valueAfterAnchor(lines, index, match.index + match[0].length)
    if (serial) return serial
  }
  return null
}

/**
 * The single entry point: give it raw OCR text, get the two fields back or
 * nulls. Never throws, never invents a value.
 */
export function parseLabelText(raw: string): LabelRead {
  const text = raw
    .toUpperCase()
    .replace(/\r/g, '')
    // Typographic quotes and dashes appear when OCR is unsure; normalise them
    // so the patterns above see plain ASCII.
    .replace(/[’‘`´]/g, "'")
    .replace(/[–—]/g, '-')

  return {
    assetTag: findTag(text),
    serial: findSerial(text),
  }
}
