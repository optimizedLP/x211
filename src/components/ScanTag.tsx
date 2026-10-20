import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { inventory } from '../lib/data'
import { looksLikeAssetTag, normalizeAssetTag } from '../lib/identifiers'
import type { BarcodeRead } from '../lib/scan/barcode'
import { readBarcodes } from '../lib/scan/barcode'
import { fileToScanCanvas } from '../lib/scan/image'
import type { ScanPhase } from '../lib/scan/ocr'
import { preloadOcr, readLabelWithOcr } from '../lib/scan/ocr'
import type { Device } from '../lib/types'

/** What the form receives. `tagIsExact` is false when OCR, not the barcode, read the tag. */
export interface ScanResult {
  assetTag: string
  serial: string
  tagIsExact: boolean
}

interface ScanTagProps {
  onClose: () => void
  onUse: (result: ScanResult) => void
}

type Stage = 'idle' | 'working' | 'duplicate' | 'empty' | 'error'

const PHASE_LABEL: Record<ScanPhase, string> = {
  preparing: 'Preparing the reader…',
  reading: 'Reading the label…',
}

/**
 * Picks the asset-tag barcode out of everything on the label. Some tags carry a
 * second Code 39 for the type code (`3554-A19`), which is not an asset tag even
 * though it has the right shape.
 */
function pickTag(codes: BarcodeRead[]): string | null {
  let best: { tag: string; score: number } | null = null

  for (const code of codes) {
    const tag = normalizeAssetTag(code.value)
    if (!tag || !looksLikeAssetTag(tag)) continue
    if (/^\d{4}-[A-Z0-9]{1,4}$/.test(tag)) continue

    // DOE tags first — both the older `DOE-LN#######` shape and the newer
    // `DOE-AC######` one. The label also carries a purchase-order Code 39
    // (`WR210066735`), which is not an asset tag, and ranking every
    // letter-initial code equally let the PO win whenever it was decoded
    // first. Then anything else letter-initial, then the rest.
    const score = /^DOE-/.test(tag) ? 3 : /^[A-Z]/.test(tag) ? 2 : 1
    if (!best || score > best.score) best = { tag, score }
  }

  return best?.tag ?? null
}

/**
 * The tag lives on a printed label, so the camera is the input. Everything runs
 * on the device: the photo is drawn to a canvas, decoded, and discarded when
 * this sheet closes. It is never uploaded and no record of it is kept.
 *
 * There is deliberately no "review" step before the form — the form already
 * shows both values, editable, and saving is the confirmation.
 */
export function ScanTag({ onClose, onUse }: ScanTagProps) {
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const previewUrl = useRef<string | null>(null)
  const cancelled = useRef(false)

  const [stage, setStage] = useState<Stage>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [phase, setPhase] = useState<ScanPhase>('preparing')
  const [ratio, setRatio] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [existing, setExisting] = useState<Device | null>(null)

  useEffect(() => {
    cancelled.current = false
    // Starts the one-time download while the person frames the label.
    preloadOcr()
    return () => {
      cancelled.current = true
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = null
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const showPreview = (file: File) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = URL.createObjectURL(file)
    setPreview(previewUrl.current)
  }

  const findExisting = async (value: string): Promise<Device | null> => {
    // Removed records keep their tag, so they still block a duplicate — the
    // database enforces the same rule.
    const devices = await inventory.listDevices({ includeDeleted: true })
    return devices.find((device) => normalizeAssetTag(device.assetTag) === value) ?? null
  }

  const scan = async (file: File) => {
    showPreview(file)
    setStage('working')
    setMessage(null)
    setExisting(null)
    setPhase('preparing')
    setRatio(0)

    try {
      const canvas = await fileToScanCanvas(file)
      if (cancelled.current) return

      // The barcode takes about a tenth of a second, so it runs first and the
      // tag appears even if the OCR engine is still downloading.
      const codes = await readBarcodes(canvas).catch(() => [])
      if (cancelled.current) return
      const exactTag = pickTag(codes)

      const text = await readLabelWithOcr(canvas, (nextPhase, nextRatio) => {
        if (cancelled.current) return
        setPhase(nextPhase)
        setRatio(nextRatio)
      }).catch(() => ({ assetTag: null, serial: null, confidence: 0 }))
      if (cancelled.current) return

      const assetTag = exactTag ?? text.assetTag
      const serialNumber = text.serial

      if (!assetTag && !serialNumber) {
        setStage('empty')
        return
      }

      if (assetTag) {
        const match = await findExisting(assetTag)
        if (cancelled.current) return
        if (match) {
          setExisting(match)
          setStage('duplicate')
          return
        }
      }

      onUse({
        assetTag: assetTag ?? '',
        serial: serialNumber ?? '',
        tagIsExact: Boolean(exactTag),
      })
      onClose()
    } catch (error) {
      if (cancelled.current) return
      setMessage(error instanceof Error ? error.message : String(error))
      setStage('error')
    }
  }

  const pick = (input: HTMLInputElement | null) => input?.click()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-line bg-panel p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="scan-title" className="text-base font-semibold text-ink">
              Scan asset tag
            </h2>
            <p className="mt-1 text-xs text-muted">
              The photo is read on this device and never uploaded.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="rounded-lg border border-line px-2 py-0.5 text-sm text-muted transition-colors hover:text-ink"
          >
            ×
          </button>
        </div>

        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void scan(file)
          }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void scan(file)
          }}
        />

        {stage === 'idle' && (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => pick(cameraInput.current)}
              className="w-full rounded-lg border border-accent/50 bg-accent/15 px-3 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/25"
            >
              Take photo
            </button>
            <button
              type="button"
              onClick={() => pick(libraryInput.current)}
              className="w-full rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink"
            >
              Choose a photo instead
            </button>
            <p className="pt-1 text-[11px] text-muted">
              The first scan downloads the label reader once (about 35 MB). It is cached after that.
            </p>
          </div>
        )}

        {stage === 'working' && (
          <div className="mt-4 space-y-3">
            {preview && (
              <img
                src={preview}
                alt="The label being scanned"
                className="mx-auto max-h-40 rounded-lg border border-line object-contain"
              />
            )}
            <div aria-live="polite" className="space-y-1">
              <p className="text-sm text-ink">{PHASE_LABEL[phase]}</p>
              {phase === 'preparing' ? (
                <>
                  {/* No byte-level progress is exposed while the engine
                      loads, so this bar shows motion rather than a number. */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
                  </div>
                  <p className="text-[11px] text-muted">
                    First scan only — about 35 MB, cached after this.
                  </p>
                </>
              ) : (
                <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {stage === 'duplicate' && existing && (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              This tag is already on record.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12.5px]">
              <dt className="font-sans text-xs text-muted">Tag</dt>
              <dd>{existing.assetTag}</dd>
              <dt className="font-sans text-xs text-muted">Serial</dt>
              <dd>{existing.serial ?? '—'}</dd>
              <dt className="font-sans text-xs text-muted">Device</dt>
              <dd className="font-sans">{existing.brand} {existing.model}</dd>
            </dl>
            {existing.deletedAt && (
              <p className="text-[11px] text-muted">
                That record was removed, but it still holds the tag.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/devices/${existing.id}`}
                onClick={onClose}
                className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
              >
                Open this device
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {(stage === 'empty' || stage === 'error') && (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              {stage === 'error'
                ? (message ?? 'The photo could not be processed.')
                : 'No tag or serial could be read. Try again with the label filling the frame.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => pick(cameraInput.current)}
                className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                Type it in instead
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
