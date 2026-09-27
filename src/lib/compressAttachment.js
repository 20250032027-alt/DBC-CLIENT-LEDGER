import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// Longest edge, in pixels, after resizing — a receipt doesn't need to be
// wider than this to stay perfectly legible, and file size drops with the
// square of the dimension reduction, so this is where most of the actual
// savings comes from.
const MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.82
// Skip compressing images that are already this small — no point
// re-processing (and potentially degrading a second time) a file that's
// already efficient.
const SKIP_IMAGE_COMPRESSION_UNDER = 150 * 1024 // 150KB
// A PDF page with at least this many real characters of extractable text
// is treated as "genuinely digital" (a real invoice, or an already-OCR'd
// scan) and left untouched — converting it to an image would throw away
// selectable/searchable text for little or no size benefit, and can even
// make text-heavy pages bigger, not smaller.
const MIN_TEXT_LENGTH_FOR_REAL_PDF = 40

// Resize (longest edge) + re-encode as JPEG. Same canvas technique the
// company logo upload already uses in Settings.jsx, just applied here to
// receipts instead of a logo, with a much larger target size since a
// receipt actually needs to stay readable.
async function compressImageFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}

// Renders one PDF page to a canvas at a resolution matched to
// MAX_DIMENSION, then runs it through the exact same JPEG compression a
// photo gets.
async function renderPdfPageToJpeg(page, filenameBase) {
  const baseViewport = page.getViewport({ scale: 1 })
  const targetScale = MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height)
  // Cap the scale — an unusually small source page shouldn't get
  // upscaled far past its native resolution just to hit MAX_DIMENSION.
  const viewport = page.getViewport({ scale: Math.min(Math.max(targetScale, 1), 3) })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  return new File([blob], `${filenameBase}.jpg`, { type: 'image/jpeg' })
}

// The full decision tree worked through in chat:
//  1. More than one page -> leave the PDF untouched (never silently
//     drop pages by only converting page 1).
//  2. Page has meaningful extractable text -> leave it untouched (a real
//     digital document, or an already-OCR'd scan with a text layer
//     worth keeping).
//  3. Otherwise (one page, no real text -> a scanned/photographed
//     receipt saved as a PDF) -> render it to an image and compress it
//     like a photo.
//  4. Safety net: only actually use the converted image if it's smaller
//     than the original PDF. If not, quietly keep the original.
async function maybeConvertPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  if (pdf.numPages !== 1) {
    return { file, converted: false }
  }

  const page = await pdf.getPage(1)
  const textContent = await page.getTextContent()
  const text = textContent.items.map(it => it.str || '').join('').trim()
  if (text.length >= MIN_TEXT_LENGTH_FOR_REAL_PDF) {
    return { file, converted: false }
  }

  const filenameBase = file.name.replace(/\.pdf$/i, '')
  const converted = await renderPdfPageToJpeg(page, filenameBase)

  if (converted.size >= file.size) {
    return { file, converted: false }
  }
  return { file: converted, converted: true }
}

// Main entry point. Always resolves to a real, usable File — either the
// compressed/converted result, or the original untouched if compression
// isn't applicable, didn't help, or something went wrong. Never throws;
// a failure here should never block someone from attaching their
// receipt, it should just fall back to uploading the original as-is.
export async function compressAttachment(file) {
  const originalSize = file.size

  try {
    if (file.type.startsWith('image/')) {
      if (originalSize < SKIP_IMAGE_COMPRESSION_UNDER) {
        return { file, originalSize, finalSize: originalSize, changed: false }
      }
      const compressed = await compressImageFile(file)
      if (compressed.size < originalSize) {
        return { file: compressed, originalSize, finalSize: compressed.size, changed: true }
      }
      return { file, originalSize, finalSize: originalSize, changed: false }
    }

    if (file.type === 'application/pdf') {
      const result = await maybeConvertPdf(file)
      return {
        file: result.file,
        originalSize,
        finalSize: result.file.size,
        changed: result.converted,
      }
    }
  } catch (err) {
    console.error('compressAttachment failed, uploading original file instead:', err)
  }

  return { file, originalSize, finalSize: originalSize, changed: false }
}
