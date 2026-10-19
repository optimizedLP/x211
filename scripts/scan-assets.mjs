/**
 * Copies the scanner's runtime files into `public/scan/` before dev and build.
 *
 * The OCR engine is a few megabytes, so it is not imported as a module: the
 * browser downloads it once, the first time someone taps "Scan tag". Keeping
 * the copies out of git (see `.gitignore`) means the binaries always come from
 * the pinned versions in `package.json` instead of drifting in the repo.
 *
 * Layout — the paths are fixed, because both libraries construct them:
 *   scan/ort/ort-wasm-simd-threaded.{wasm,mjs}   ONNX Runtime
 *   scan/ppocr/{det.onnx,rec.onnx,keys.txt}      PaddleOCR PP-OCRv4
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const outDir = join(root, 'public', 'scan')

// Neither package exports `package.json`, so resolve a known file and walk up.
const ortDist = dirname(require.resolve('onnxruntime-web'))
const modelsRoot = dirname(require.resolve('@gutenye/ocr-models/node'))

const files = [
  // Runtime. The `.mjs` loader is fetched by the `.wasm` glue, so both travel.
  [join(ortDist, 'ort-wasm-simd-threaded.wasm'), 'ort/ort-wasm-simd-threaded.wasm'],
  [join(ortDist, 'ort-wasm-simd-threaded.mjs'), 'ort/ort-wasm-simd-threaded.mjs'],
  // PP-OCRv4: detection finds text lines, recognition reads them.
  [join(modelsRoot, 'assets', 'ch_PP-OCRv4_det_infer.onnx'), 'ppocr/det.onnx'],
  [join(modelsRoot, 'assets', 'ch_PP-OCRv4_rec_infer.onnx'), 'ppocr/rec.onnx'],
  [join(modelsRoot, 'assets', 'ppocr_keys_v1.txt'), 'ppocr/keys.txt'],
]

let copied = 0
for (const [source, name] of files) {
  if (!existsSync(source)) {
    throw new Error(`Scanner asset missing: ${source}. Run npm install, then try again.`)
  }
  const target = join(outDir, name)
  mkdirSync(dirname(target), { recursive: true })

  // Re-copy when the installed package is newer or the file is gone; skip the
  // 10 MB rewrite on every dev-server restart otherwise.
  const fresh =
    existsSync(target) &&
    statSync(target).size === statSync(source).size &&
    statSync(target).mtimeMs >= statSync(source).mtimeMs
  if (fresh) continue

  copyFileSync(source, target)
  copied += 1
}

if (copied > 0) console.log(`scan-assets: refreshed ${copied} file(s) in public/scan`)
