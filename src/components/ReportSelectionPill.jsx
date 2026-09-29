import { useState, useEffect, useRef } from 'react'
import { Flag } from 'lucide-react'
import { captureScreenshot } from '../lib/screenshot'
import ReportModal from './ReportModal.jsx'

const COOLDOWN_SECONDS = 8

export default function ReportSelectionPill({ page }) {
  const [pillPos, setPillPos] = useState(null) // { top, left } or null
  const [selectedText, setSelectedText] = useState('')
  const [modalState, setModalState] = useState(null) // null | 'hidden' | 'open'
  const [screenshot, setScreenshot] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const cooldownUntilRef = useRef(0)

  useEffect(() => {
    function onSelectionChange() {
      if (modalState) return // don't fight with an open report modal
      const sel = window.getSelection()
      const text = sel?.toString().trim()
      if (!text || sel.isCollapsed) { setPillPos(null); return }

      // Skip selections happening inside the report modal itself —
      // reporting on text from the report form you're already filling
      // out isn't a useful loop to open.
      const anchorEl = sel.anchorNode?.parentElement
      if (anchorEl?.closest('.modal')) { setPillPos(null); return }

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) { setPillPos(null); return }
      setSelectedText(text)
      setPillPos({ top: rect.top - 42, left: Math.max(8, rect.left) })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [modalState])

  async function handleOpen() {
    if (cooldownUntilRef.current > Date.now() || capturing) return
    setPillPos(null)
    setCapturing(true)
    try {
      const shot = await captureScreenshot()
      setScreenshot(shot)
    } catch (err) {
      console.error('screenshot capture failed:', err)
    } finally {
      setCapturing(false)
      setModalState('open')
    }
  }

  function handleClose(fullyClose) {
    setModalState(fullyClose ? null : 'hidden')
    if (fullyClose) window.getSelection()?.removeAllRanges()
  }

  function handleSubmitted() {
    cooldownUntilRef.current = Date.now() + COOLDOWN_SECONDS * 1000
  }

  return (
    <>
      {pillPos && !modalState && (
        <button
          onClick={handleOpen}
          style={{
            position: 'fixed', top: pillPos.top, left: pillPos.left, zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--text-1)', color: 'var(--surface)',
            border: 'none', borderRadius: 99, padding: '7px 13px', fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.25)', animation: 'message-in 0.15s ease',
          }}
        >
          <Flag size={13} /> Report this
        </button>
      )}

      {modalState && (
        <div style={{ display: modalState === 'hidden' ? 'none' : 'block' }}>
          <ReportModal
            page={page}
            selectedText={selectedText}
            initialScreenshot={screenshot}
            onClose={handleClose}
            onSubmitted={handleSubmitted}
          />
        </div>
      )}
    </>
  )
}
