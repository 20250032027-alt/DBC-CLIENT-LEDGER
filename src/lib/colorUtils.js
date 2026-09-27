// Color math for the Appearance settings — accent presets and custom
// colors both flow through these same functions, so a custom color gets
// exactly the same safety behavior (auto text contrast, derived shades)
// as a built-in preset, not a lesser version of it.

export function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const num = parseInt(full, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

export function isValidHex(hex) {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)
}

// WCAG relative luminance — the standard formula, not a rough approximation.
export function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

// WCAG contrast ratio between two hex colors — 1 (no contrast) to 21
// (black on white). 4.5 is the standard minimum for normal text.
export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1))
  const l2 = relativeLuminance(hexToRgb(hex2))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// The auto-adapt piece: given a background color, pick white or a near-
// black text color, whichever actually reads better on it — this is what
// stops "light accent + white button text" from ever happening, without
// needing the person to think about it at all.
export function pickReadableTextColor(bgHex) {
  const white = '#ffffff'
  const dark = '#101828' // matches --text-1, not pure black — softer, matches the app's existing type color
  const whiteContrast = contrastRatio(bgHex, white)
  const darkContrast = contrastRatio(bgHex, dark)
  // Dark only wins if it's CLEARLY better, not just technically ahead by
  // a hair — a near-tie shouldn't flip away from white, since every
  // button in this app already uses white text on the default accent and
  // reads fine; verified this exact case (#4f72f5) scores white 4.15 vs
  // dark 4.27 — a marginal, not meaningful, difference.
  return darkContrast > whiteContrast + 0.5 ? dark : white
}

function mix(hex, targetHex, amount) {
  const a = hexToRgb(hex)
  const b = hexToRgb(targetHex)
  return rgbToHex(
    a.r + (b.r - a.r) * amount,
    a.g + (b.g - a.g) * amount,
    a.b + (b.b - a.b) * amount,
  )
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

// One base color in, a full coordinated set out — the same five values
// every preset already defines, so a custom accent behaves identically to
// a built-in one everywhere it's used in the app, not just in the swatch.
export function deriveAccentShades(baseHex, theme) {
  const dim = mix(baseHex, '#000000', 0.15)
  const hover = mix(baseHex, '#ffffff', 0.08)
  const glowAlpha = theme === 'dark' ? 0.12 : 0.14
  const subtleAlpha = theme === 'dark' ? 0.06 : 0.08
  return {
    accent: baseHex,
    accentDim: dim,
    accentHover: hover,
    accentGlow: hexToRgba(baseHex, glowAlpha),
    accentSubtle: hexToRgba(baseHex, subtleAlpha),
    accentText: pickReadableTextColor(baseHex),
  }
}

// Only checks what deriveAccentShades/pickReadableTextColor CAN'T already
// fix automatically — see the reasoning worked through in chat: text
// sitting ON a color (like button labels) is handled by auto-adapting
// text color, so it's not re-checked here. What's left, and what this
// actually warns about, is a color that's hard to make out at all against
// the page itself — either because it nearly matches the page background
// (the accent "disappears" as a UI element), or because it's used directly
// as text/links against the page's own fixed text-on-background contrast.
export function checkAccentAccessibility(baseHex, bgHex) {
  const warnings = []
  const ratio = contrastRatio(baseHex, bgHex)
  // Lower bar: can you tell this is even a distinct UI element (a button,
  // a highlight) sitting on the page at all?
  if (ratio < 1.5) {
    warnings.push('This color is very close to the page background — buttons and highlights using it may be hard to notice.')
  }
  // Higher bar: if this color is read as TEXT (links, the active tab),
  // is it actually legible against the page?
  if (ratio < 3) {
    warnings.push('When used as text (like links), this color may be hard to read against the page background.')
  }
  return warnings
}
