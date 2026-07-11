// Handles "Add to Home Screen" across platforms.
//
// - Chrome/Edge/Samsung Internet on Android *can* fire `beforeinstallprompt`,
//   but only within a narrow window and only if the browser's own internal
//   heuristics are satisfied. We capture the event the moment it fires (this
//   module is imported from main.jsx, so the listener attaches before React
//   even mounts) and stash it so a normal in-app button can trigger it on
//   demand, instead of waiting on the browser.
// - iOS Safari does not support `beforeinstallprompt` at all, ever. There is
//   no programmatic install trigger there — the only path is the manual
//   Share -> "Add to Home Screen" flow, so we detect iOS and show
//   instructions instead of a fake button that would do nothing.
// - Some browsers (older Samsung Internet, Firefox, etc.) support neither.
//   Those get generic manual instructions too.

let deferredPrompt = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    window.dispatchEvent(new Event('dbc-ledger-install-available'))
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.dispatchEvent(new Event('dbc-ledger-install-available'))
  })
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export function hasNativePrompt() {
  return !!deferredPrompt
}

// 'installed' | 'native' (Android with a real prompt available) |
// 'ios' (needs manual Share instructions) | 'manual' (any other browser)
export function getInstallState() {
  if (isStandalone()) return 'installed'
  if (deferredPrompt) return 'native'
  if (isIOS()) return 'ios'
  return 'manual'
}

// Triggers the real native browser prompt. Only works when getInstallState() === 'native'.
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable'
  deferredPrompt.prompt()
  const choice = await deferredPrompt.userChoice
  deferredPrompt = null
  window.dispatchEvent(new Event('dbc-ledger-install-available'))
  return choice.outcome // 'accepted' | 'dismissed'
}
