/**
 * Barcode decoding for the asset tag.
 *
 * The tag is the one field that does not need OCR: every DOE label carries a
 * Code 39 barcode that encodes the tag exactly. Decoding is a lookup, so it is
 * immune to the O/0 and I/1 mistakes that make OCR guesses dangerous.
 *
 * Two decoders, in order:
 *   1. `BarcodeDetector`, built into Chrome/Android. Fast and native.
 *   2. ZXing, imported only when (1) is missing — which is every browser on
 *      iOS, including Safari on the phone this is used from.
 *
 * The ZXing import is deliberately dynamic: it is ~360 KB that a desktop
 * visitor should never download.
 */

export interface BarcodeRead {
  value: string
  format: string
}

interface DetectedBarcode {
  rawValue: string
  format: string
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats(): Promise<string[]>
}

/** The formats a school label can plausibly carry. Code 39 is the real one. */
const FORMATS = ['code_39', 'code_128']

async function readWithNativeDetector(canvas: HTMLCanvasElement): Promise<BarcodeRead[]> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
  if (!Detector) return []

  try {
    const supported = await Detector.getSupportedFormats()
    const formats = FORMATS.filter((format) => supported.includes(format))
    if (formats.length === 0) return []

    const found = await new Detector({ formats }).detect(canvas)
    return found
      .map((code) => ({ value: code.rawValue, format: code.format }))
      .filter((code) => code.value.trim().length > 0)
  } catch {
    // A detector that exists but refuses this image is not an error worth
    // showing — the fallback below gets a turn.
    return []
  }
}

async function readWithZxing(canvas: HTMLCanvasElement): Promise<BarcodeRead[]> {
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    const result = reader.decodeFromCanvas(canvas)
    const value = result.getText().trim()
    return value ? [{ value, format: String(result.getBarcodeFormat()) }] : []
  } catch {
    // ZXing throws NotFoundException when no barcode is legible. That is a
    // normal outcome on a torn or glare-hit label, not a failure to report.
    return []
  }
}

/**
 * Returns every legible barcode, most useful first. An empty array means the
 * label was not readable, which the caller turns into "type it in".
 */
export async function readBarcodes(canvas: HTMLCanvasElement): Promise<BarcodeRead[]> {
  const native = await readWithNativeDetector(canvas)
  if (native.length > 0) {
    return native.sort((a, b) => Number(b.format === 'code_39') - Number(a.format === 'code_39'))
  }
  return readWithZxing(canvas)
}
