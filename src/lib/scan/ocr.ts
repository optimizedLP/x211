import type { LabelRead } from './parse'
import { parseLabelText } from './parse'

/**
 * Text recognition for the serial number.
 *
 * Only the serial needs OCR: the asset tag comes from the barcode.
 *
 * The engine is PaddleOCR's PP-OCRv4, running through ONNX Runtime Web. It was
 * chosen after measuring the alternative: Tesseract read one of four sample
 * serials correctly (it turned `S1P6082` into `SAPRNR2`), PP-OCR read all four.
 * On a 22-character Chromebook serial that difference is the whole feature.
 *
 * Everything is self-hosted from `public/scan` (copied by
 * `scripts/scan-assets.mjs`): no CDN, no API key, and the photo never leaves
 * the device.
 *
 * The download is one-time and large — about 25 MB of model and runtime. It
 * starts when the scan sheet opens, so it overlaps with framing the label, and
 * the browser caches it for later scans.
 */

export type ScanPhase = 'preparing' | 'reading'

export type ScanProgress = (phase: ScanPhase, ratio: number) => void

export interface OcrRead extends LabelRead {
  /** PP-OCR's confidence for the serial line, 0–1. */
  confidence: number
}

interface TextLine {
  text: string
  mean: number
}

interface OcrEngine {
  detect(
    image: string | { data: Uint8ClampedArray; width: number; height: number },
  ): Promise<{ texts: TextLine[] }>
}

interface OcrModule {
  create(options: {
    models: { detectionPath: string; recognitionPath: string; dictionaryPath: string }
  }): Promise<OcrEngine>
}

interface OrtModule {
  env: {
    logLevel: string
    wasm: { wasmPaths: string; numThreads: number }
  }
}

/** `BASE_URL` carries the trailing slash, so relative assets work on Pages too. */
const SCAN_BASE = `${import.meta.env.BASE_URL}scan`

let enginePromise: Promise<OcrEngine> | null = null

async function createEngine(): Promise<OcrEngine> {
  // ONNX Runtime resolves the wasm glue from `wasmPaths`; both files are
  // copied next to the models. It is imported first so the path is set before
  // the OCR module creates its sessions.
  const ort = (await import('onnxruntime-web')) as unknown as OrtModule
  ort.env.wasm.wasmPaths = `${SCAN_BASE}/ort/`
  ort.env.logLevel = 'error'
  // The app is not cross-origin isolated (no COOP/COEP), so SharedArrayBuffer
  // is unavailable and threads would only produce a warning and fall back.
  ort.env.wasm.numThreads = 1

  const module = (await import('@gutenye/ocr-browser')) as unknown as { default: OcrModule }
  return module.default.create({
    models: {
      detectionPath: `${SCAN_BASE}/ppocr/det.onnx`,
      recognitionPath: `${SCAN_BASE}/ppocr/rec.onnx`,
      dictionaryPath: `${SCAN_BASE}/ppocr/keys.txt`,
    },
  })
}

function getEngine(): Promise<OcrEngine> {
  if (!enginePromise) {
    enginePromise = createEngine().catch((error: unknown) => {
      // A failed load must not poison every later attempt.
      enginePromise = null
      throw error
    })
  }
  return enginePromise
}

/**
 * Starts the download before the photo exists. Called when the scan sheet
 * opens; a failure is ignored here and reported by the scan itself.
 */
export function preloadOcr(): void {
  void getEngine().catch(() => undefined)
}

function serialConfidence(lines: TextLine[], serial: string | null): number {
  if (!serial) return 0
  const line = lines.find((candidate) => {
    const compact = candidate.text.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return compact.includes(serial)
  })
  return line?.mean ?? Math.max(0, ...lines.map((candidate) => candidate.mean))
}

/**
 * Reads the label and returns whatever could be anchored. A missing field is
 * returned as null and typed in by hand; nothing is guessed.
 */
export async function readLabelWithOcr(
  canvas: HTMLCanvasElement,
  onProgress: ScanProgress,
): Promise<OcrRead> {
  onProgress('preparing', 0)
  const engine = await getEngine()

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('This browser cannot process images.')
  const image = context.getImageData(0, 0, canvas.width, canvas.height)

  onProgress('reading', 0.4)
  const result = await engine.detect({
    data: image.data,
    width: canvas.width,
    height: canvas.height,
  })
  onProgress('reading', 1)

  const text = result.texts.map((line) => line.text).join('\n')
  const parsed = parseLabelText(text)
  return { ...parsed, confidence: serialConfidence(result.texts, parsed.serial) }
}
