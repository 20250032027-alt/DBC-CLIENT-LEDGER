import { useTutorial } from '../lib/tutorial.jsx'
import { GraduationCap, X } from 'lucide-react'
import { showToast } from '../lib/toast'

// The specific, gentle first-time ask — shows once, ever, unless someone
// explicitly asks to see it again from Settings. Saying no is treated as
// a completely normal answer, not something to push back on.
export default function TutorialNudge() {
  const { mode, dismissNudge, acceptNudge } = useTutorial()
  if (mode !== 'nudge') return null

  function handleNotNow() {
    dismissNudge()
    showToast("That's okay! You can start it any time from Settings.", 'info', 5000)
  }

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 20, zIndex: 999,
      maxWidth: 340, background: 'var(--surface)', border: '1px solid var(--border2)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
      padding: '16px 18px', animation: 'message-in 0.25s ease',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-glow)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <GraduationCap size={17} color="var(--accent)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>New here?</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Want a quick look around? It only takes a few minutes, and nothing you do is saved for real.
          </div>
        </div>
        <button className="icon-btn" onClick={handleNotNow} style={{ flexShrink: 0 }} title="Not now">
          <X size={15} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={handleNotNow} style={{ flex: 1 }}>
          Not now
        </button>
        <button className="btn btn-primary btn-sm" onClick={acceptNudge} style={{ flex: 1 }}>
          Show me around
        </button>
      </div>
    </div>
  )
}
