import { useState } from 'react'
import { Flag, Loader2 } from 'lucide-react'
import { captureScreenshot } from '../lib/screenshot'
import { showToast } from '../lib/toast'
import ReportModal from './ReportModal.jsx'

const COOLDOWN_SECONDS = 8

export default function ReportButton({ page }) {
  const [modalState, setModalState] = useState(null) // null | 'hidden' | 'open'
  const [screenshot, setScreenshot] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)

  const onCooldown = cooldownUntil > Date.now()

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

  function handleClose(fullyClose) {
    setModalState(fullyClose ? null : 'hidden')
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

      {modalState && (
        <div style={{ display: modalState === 'hidden' ? 'none' : 'block' }}>
          <ReportModal
            page={page}
            initialScreenshot={screenshot}
            onClose={handleClose}
            onSubmitted={handleSubmitted}
          />
        </div>
      )}
    </>
  )
}
