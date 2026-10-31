import { useState, useEffect } from 'react'
import { Flag, Loader2 } from 'lucide-react'
import { captureScreenshot } from '../lib/screenshot'
import ReportModal from './ReportModal.jsx'

const COOLDOWN_SECONDS = 8

export default function ReportButton({ page }) {
  const [modalState, setModalState] = useState(null) // null | 'hidden' | 'open'
  const [screenshot, setScreenshot] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)

  // A timer clears the cooldown when it ends. Checking the clock while
  // drawing (the old way) meant nothing re-drew the button afterward, so it
  // could stay greyed out long after the 8 seconds were up.
  const onCooldown = cooldownUntil > 0
  useEffect(() => {
    if (!cooldownUntil) return
    const t = setTimeout(() => setCooldownUntil(0), Math.max(0, cooldownUntil - Date.now()))
    return () => clearTimeout(t)
  }, [cooldownUntil])

  async function handleOpen() {
    if (onCooldown || capturing) return
    setCapturing(true)
    try {
      const shot = await captureScreenshot()
      setScreenshot(shot)
    } catch (err) {
      console.error('screenshot capture failed:', err)
      // A failed screenshot shouldn't block reporting — just open without one.
    } finally {
      setCapturing(false)
      setModalState('open')
    }
  }

  function handleClose() {
    setModalState(null)
  }

  function handleSubmitted() {
    setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000)
  }

  return (
    <>
      <button
        className="icon-btn help-chat-fab"
        onClick={handleOpen}
        title={onCooldown ? 'Just sent — one moment' : 'Report a problem'}
        disabled={onCooldown}
        style={{
          position: 'fixed', bottom: 20, right: 84, zIndex: 999,
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--surface)', color: 'var(--text-2)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', border: '1px solid var(--border2)',
          opacity: onCooldown ? 0.5 : 1,
        }}
      >
        {capturing ? <Loader2 size={19} className="spin" /> : <Flag size={19} />}
      </button>

      {modalState === 'open' && (
        <ReportModal
          page={page}
          initialScreenshot={screenshot}
          onClose={handleClose}
          onSubmitted={handleSubmitted}
        />
      )}
    </>
  )
}
