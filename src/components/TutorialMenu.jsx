import { useTutorial, SEGMENTS } from '../lib/tutorial.jsx'
import { X, PlayCircle, GraduationCap } from 'lucide-react'

// Segments a given viewer shouldn't see get filtered out here — e.g. a
// Team Member without Vouchers access wouldn't see "Recording a
// Transaction" offered at all, rather than being invited into a segment
// that immediately points at something they can't actually use.
export default function TutorialMenu({ visibleSegmentIds }) {
  const { mode, closeTutorial, startSegment } = useTutorial()
  if (mode !== 'menu') return null

  const segments = SEGMENTS.filter(s => !visibleSegmentIds || visibleSegmentIds.includes(s.id))

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeTutorial()}>
      <div className="modal" style={{ maxWidth: 460 }} onKeyDown={e => e.key === 'Escape' && closeTutorial()}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GraduationCap size={17} /> Tutorial
          </span>
          <button className="icon-btn" onClick={closeTutorial}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)', marginBottom: 14 }}>
          Pick anything below — in any order you like.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {segments.map(seg => (
            <button
              key={seg.id}
              onClick={() => startSegment(seg.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                padding: '14px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--surface2)', cursor: 'pointer', color: 'var(--text-1)',
              }}
            >
              <PlayCircle size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
              <span>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{seg.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{seg.description}</div>
              </span>
            </button>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeTutorial}>Close</button>
        </div>
      </div>
    </div>
  )
}
