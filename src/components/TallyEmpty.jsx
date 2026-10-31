import Tally from './Tally.jsx'

// The friendly empty state used across the app: Tally plus a short, helpful
// message. mood "idle" greets someone starting out; "thinking" means there
// IS data, but the current search or filters matched none of it.
export default function TallyEmpty({ mood = 'idle', title, children, actions }) {
  return (
    <div className="empty-state tally-empty">
      <Tally mood={mood} size={68} />
      <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 14.5 }}>{title}</div>
      {children && <div style={{ fontSize: 13, maxWidth: 380, lineHeight: 1.55 }}>{children}</div>}
      {actions && <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</div>}
    </div>
  )
}
