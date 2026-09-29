import html2canvas from 'html2canvas'
import { compressAttachment } from './compressAttachment'

// Captures the current page as a compressed image file, ready to upload.
// Reuses the exact same compression pipeline already built for voucher
// receipts — a screenshot is just another image that shouldn't be
// uploaded at full, uncompressed size.
//
// Worth knowing: html2canvas reconstructs the page from the DOM rather
// than doing a literal pixel capture, so it's a strong approximation,
// not a guaranteed pixel-perfect screenshot — a few modern CSS effects
// (some gradients, backdrop blurs) don't always render quite right in
// the output. Good enough for "here's roughly what I was looking at,"
// not for pixel-level visual QA.
export async function captureScreenshot() {
  const canvas = await html2canvas(document.body, {
    logging: false,
    useCORS: true,
    scale: Math.min(window.devicePixelRatio || 1, 2), // cap at 2x — no real benefit going higher for a bug report, just a bigger upload
  })
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  const file = new File([blob], 'screenshot.png', { type: 'image/png' })
  const { file: compressed } = await compressAttachment(file)
  return compressed
}
