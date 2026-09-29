import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore.jsx'
import { captureScreenshot } from '../lib/screenshot'
import { showToast } from '../lib/toast'
import { X, Bug, HelpCircle, Lightbulb, MoreHorizontal, Camera, RotateCcw } from 'lucide-react'

const CATEGORIES = [
  { id: 'bug', label: 'Something broken', icon: Bug },
  { id: 'confusing', label: 'Confusing', icon: HelpCircle },
  { id: 'suggestion', label: 'Suggestion', icon: Lightbulb },
  { id: 'other', label: 'Other', icon: MoreHorizontal },
]

const STATUS_LABEL = { new: 'New', seen: 'Seen', resolved: 'Resolved' }
const STATUS_COLOR = { new: 'badge-amber', seen: 'badge-blue', resolved: 'badge-green' }

// `initialScreenshot` is captured by whatever triggered this modal
// (the button or the selection pill), BEFORE the modal itself opens —
// capturing after opening would just photograph the modal, not the
// actual page someone's trying to report about.
//
// `initialDescription`, if given, wins over the selectedText-based
// default — used by callers (like a chat error) that want to pre-fill
// something more specific than a "Re: selected text" quote.
export default function ReportModal({ page, selectedText, initialDescription, initialCategory, initialScreenshot, onClose, onSubmitted }) {
  const { submitReport, myReports, loadMyReports } = useStore()
  const [category, setCategory] = useState(initialCategory || 'bug')
  const [description, setDescription] = useState(
    initialDescription || (selectedText ? `Re: "${selectedText}"\n\n` : '')
  )
  const [screenshot, setScreenshot] = useState(initialScreenshot)
  const [includeScreenshot, setIncludeScreenshot] = useState(true)
  const [retaking, setRetaking] = useState(false)
  // Purely local — whether THIS modal's own markup is momentarily hidden
  // while a fresh screenshot is captured. Kept internal rather than
  // routed through the parent's open/closed state, so there's no
  // three-way state (open / hidden / closed) squeezed into one boolean
  // that only ever had room for two.
  const [selfHidden, setSelfHidden] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => { loadMyReports() }, [])

  useEffect(() => {
    if (!screenshot) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(screenshot)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [screenshot])

  // Hides the modal itself first, waits a beat for it to actually
  // disappear from the page, then captures — same ordering reasoning as
  // the initial capture, just triggered again on demand.
  async function handleRetake() {
    setRetaking(true)
    setSelfHidden(true) // hide THIS modal's own markup so the screenshot doesn't capture itself
    await new Promise(r => setTimeout(r, 150))
    try {
      const shot = await captureScreenshot()
      setScreenshot(shot)
    } catch (err) {
      showToast('Could not capture a new screenshot.', 'error')
    } finally {
      setRetaking(false)
      setSelfHidden(false)
    }
  }

  async function handleSubmit() {
    if (!description.trim()) {
      showToast('Add a quick description first.', 'error')
      return
    }
    setSubmitting(true)
    try {
      await submitReport({
        description: description.trim(),
        category,
        selectedText: selectedText || null,
        page,
        screenshotFile: includeScreenshot ? screenshot : null,
      })
      showToast('Thanks — that\'s been sent through.', 'synced')
      onSubmitted?.()
      onClose(true)
    } catch (err) {
      showToast('Could not send that — check your connection and try again.', 'error')
      console.error('report submit error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" style={{ display: selfHidden ? 'none' : 'flex' }} onClick={e => e.target === e.currentTarget && onClose(true)}>
      <div className="modal" style={{ maxWidth: 480 }} onKeyDown={e => e.key === 'Escape' && onClose(true)}>
        <div className="modal-header">
          <span className="modal-title">Report a Problem</span>
          <button className="icon-btn" onClick={() => onClose(true)}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>What kind of thing is this?</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              className="btn btn-ghost btn-sm"
              style={{ background: category === c.id ? 'var(--accent-glow)' : undefined, borderColor: category === c.id ? 'var(--accent)' : undefined }}
              onClick={() => setCategory(c.id)}
            >
              <c.icon size={13} /> {c.label}
            </button>
          ))}
        </div>

        <div className="form-group">
          <label className="form-label">What's going on?</label>
          <textarea
            className="form-textarea" rows={4} value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Tell us what happened, or what you expected instead..."
            style={{ resize: 'vertical' }}
          />
        </div>

        <div style={{ marginTop: 10, marginBottom: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={includeScreenshot} onChange={e => setIncludeScreenshot(e.target.checked)} />
            Include a screenshot
          </label>
        </div>
        {includeScreenshot && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
            {previewUrl ? (
              <img src={previewUrl} alt="Screenshot preview" style={{ width: 70, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
            ) : (
              <div style={{ width: 70, height: 50, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}><Camera size={18} /></div>
            )}
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-3)' }}>
              {retaking ? 'Capturing...' : 'A snapshot of the page as it looked just now.'}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleRetake} disabled={retaking}>
              <RotateCcw size={13} /> Retake
            </button>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => onClose(true)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Sending...' : 'Send Report'}
          </button>
        </div>

        {myReports.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>Your recent reports</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
              {myReports.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span className={`badge ${STATUS_COLOR[r.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>{STATUS_LABEL[r.status] || r.status}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{r.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
