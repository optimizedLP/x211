/**
 * Shape rules for the two identifiers this app treats as keys.
 *
 * Values arrive from four places — a barcode, OCR, a spreadsheet and a
 * keyboard — so the rules live here rather than being repeated per screen.
 *
 * Measured against the real fleet:
 *   * tags look like `DOE-LN0068914`
 *   * serials are upper-case letters and digits, no dashes or punctuation
 *   * Chromebook serials are long: `NXGP6AA00190508AC27600` is 22 characters
 *
 * Nothing here truncates. A shortened serial is a different device, and it
 * would fail silently.
 */

export const MAX_IDENTIFIER_LENGTH = 32

/** `doe-ln0068914 ` and `DOE-LN0068914` are the same tag. */
export function normalizeAssetTag(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : null
}

/**
 * `M.J27TBK` is how OCR rendered a serial with a stray period; the device's
 * value is `MJ27TBK`. Spaces are removed too because Tesseract sometimes
 * splits a long run in two.
 */
export function normalizeSerial(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return cleaned.length > 0 ? cleaned : null
}

/**
 * Loose enough for an older or differently prefixed tag, strict enough to
 * reject a line of prose. Requires a digit: a tag without one is almost always
 * a misread field label.
 */
export function looksLikeAssetTag(value: string): boolean {
  return value.length <= MAX_IDENTIFIER_LENGTH && /^[A-Z0-9][A-Z0-9-]{3,}$/.test(value) && /\d/.test(value)
}

/** Serials carry no separators, so anything outside `A–Z0–9` is OCR noise. */
export function looksLikeSerial(value: string): boolean {
  return value.length >= 5 && value.length <= MAX_IDENTIFIER_LENGTH && /^[A-Z0-9]+$/.test(value)
}
