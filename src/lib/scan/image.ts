/**
 * Turns a photo from the camera or library into a canvas the decoders can read.
 *
 * Two things matter here:
 *   * Orientation. iPhone photos are stored rotated with an EXIF flag. Drawing
 *     them without honouring it feeds a sideways label to OCR, which then
 *     finds no text at all.
 *   * Size. Camera shots are 3000–4000 px wide; 2000 px keeps the serial
 *     legible while staying well inside a phone's canvas limits.
 *
 * Nothing is uploaded and no object URL outlives the conversion.
 */

export const MAX_SCAN_DIMENSION = 2000

function drawScaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SCAN_DIMENSION / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))

  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot process images.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function loadElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That image could not be opened. Try taking the photo instead.'))
    }
    image.src = url
  })
}

export async function fileToScanCanvas(file: File): Promise<HTMLCanvasElement> {
  if ('createImageBitmap' in window) {
    try {
      // `from-image` applies the EXIF rotation; Safari and Chrome both accept it.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      try {
        return drawScaled(bitmap, bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    } catch {
      // Fall through: some browsers reject the options object or the format
      // itself. The <img> path below still handles everything they can decode.
    }
  }

  const image = await loadElement(file)
  return drawScaled(image, image.naturalWidth, image.naturalHeight)
}
