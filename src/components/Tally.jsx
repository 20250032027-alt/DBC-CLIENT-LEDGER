import { useId } from 'react'

// Tally — DBC Ledger's assistant.
//
// Drawn in the app's own visual language rather than as a cartoon: flat
// shapes with no outlines, the cover in the user's accent color (exactly
// like the logo tile in the sidebar), and the face on a white label —
// real ledgers have a label on the cover, and a white rounded panel on a
// colored surface is what the app's cards and logo already look like.
// The face is drawn with the same rounded strokes as the app's icons.
//
// One drawing works at every size, from the 24px message avatar to the
// welcome screen. Life comes from gentle motion (a float and an
// occasional blink, see .tally-animate in index.css), which is switched
// off for people who prefer reduced motion.
//
// mood: idle | thinking | happy | concerned | sleepy
const INK = 'var(--tally-ink, #1d2433)'
const LABEL = 'var(--tally-label, #ffffff)'
const PAGES = 'var(--tally-pages, #e4e9f6)'
const GOLD = '#f2b53a'

export default function Tally({ mood = 'idle', size = 48, animate = true, title = 'Tally', className = '', style }) {
  const uid = 'tally' + useId().replace(/:/g, '')
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size}
      role="img" aria-label={title}
      className={`tally tally-${mood} ${animate ? 'tally-animate' : ''} ${className}`}
      style={{ color: 'var(--accent)', flexShrink: 0, display: 'block', overflow: 'visible', ...style }}
    >
      <defs>
        <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".14" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="61.2" rx="19" ry="1.8" fill="#000" opacity=".08" />
      <g className="tally-float">
        {/* pages, peeking out on the right and bottom */}
        <rect x="12" y="8.5" width="43" height="50" rx="11" fill={PAGES} />
        {/* bookmark ribbon */}
        <path d="M41 54h6v8.5l-3-2.4-3 2.4z" fill={GOLD} />
        {/* cover */}
        <rect x="8" y="5" width="44" height="51" rx="12" fill="currentColor" />
        <rect x="8" y="5" width="44" height="51" rx="12" fill={`url(#${uid}-shade)`} />
        {/* spine */}
        <path d="M20 5H16.5a8.5 8.5 0 0 0-8.5 8.5v34A8.5 8.5 0 0 0 16.5 56H20Z" fill="#000" opacity=".1" />
        <path d="M11.5 15h5M11.5 46h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
        {/* the label — Tally's face */}
        <rect x="21.5" y="15.5" width="26" height="23" rx="7" fill={LABEL} />
        <Face mood={mood} />
      </g>
      <Extra mood={mood} />
    </svg>
  )
}

// Face features, centered on the label (34.5, 27).
function Face({ mood }) {
  const stroke = { stroke: INK, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
  const cheeks = (
    <g fill="#ff8fa6" opacity=".55">
      <ellipse cx="25.6" cy="30.8" rx="1.9" ry="1.15" />
      <ellipse cx="43.4" cy="30.8" rx="1.9" ry="1.15" />
    </g>
  )
  switch (mood) {
    case 'thinking':
      return (<>
        <g className="tally-eyes" fill={INK}>
          <ellipse cx="30.6" cy="24.8" rx="1.8" ry="2.3" /><ellipse cx="39.6" cy="24.8" rx="1.8" ry="2.3" />
        </g>
        {cheeks}
        <path d="M33 32.4h4" {...stroke} />
      </>)
    case 'happy':
      return (<>
        <path d="M27 26.6q2.1-2.6 4.2 0M37.8 26.6q2.1-2.6 4.2 0" {...stroke} />
        {cheeks}
        <path d="M30.8 30.6h7.4q-.4 4.1-3.7 4.1t-3.7-4.1Z" fill={INK} />
      </>)
    case 'concerned':
      return (<>
        <path d="M27 22.4l3.4-1.1M42 22.4l-3.4-1.1" {...stroke} strokeWidth="1.6" />
        <g className="tally-eyes" fill={INK}>
          <ellipse cx="29.6" cy="26.3" rx="1.6" ry="2" /><ellipse cx="39.4" cy="26.3" rx="1.6" ry="2" />
        </g>
        {cheeks}
        <path d="M31.3 33.2q1.6-1.3 3.2 0t3.2 0" {...stroke} />
      </>)
    case 'sleepy':
      return (<>
        <path d="M27 26.2q2.1 1.9 4.2 0M37.8 26.2q2.1 1.9 4.2 0" {...stroke} />
        {cheeks}
        <ellipse cx="34.5" cy="32.4" rx="1.4" ry="1.6" fill={INK} />
      </>)
    default: // idle
      return (<>
        <g className="tally-eyes" fill={INK}>
          <ellipse cx="29.6" cy="25.6" rx="1.8" ry="2.3" /><ellipse cx="39.4" cy="25.6" rx="1.8" ry="2.3" />
        </g>
        {cheeks}
        <path d="M31.4 31.2q3.1 2.7 6.2 0" {...stroke} />
      </>)
  }
}

// Small status badges, in the app's own status colors.
function Extra({ mood }) {
  switch (mood) {
    case 'thinking': // a tiny typing bubble
      return (
        <g className="tally-dots">
          <rect x="43" y="0.5" width="19" height="9.5" rx="4.75" fill={LABEL} stroke="currentColor" strokeWidth="1.3" />
          <circle cx="48" cy="5.25" r="1.25" fill="currentColor" /><circle cx="52.5" cy="5.25" r="1.25" fill="currentColor" /><circle cx="57" cy="5.25" r="1.25" fill="currentColor" />
        </g>
      )
    case 'happy': // books tally: a green check
      return (<>
        <circle cx="52.5" cy="6.5" r="6" fill="var(--green, #16a34a)" />
        <path d="M49.8 6.6l1.9 1.9 3.6-3.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>)
    case 'concerned': // something needs a look: an amber "!"
      return (<>
        <circle cx="52.5" cy="6.5" r="6" fill="var(--amber, #d97706)" />
        <path d="M52.5 3.6v3.4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" /><circle cx="52.5" cy="9.4" r="1.05" fill="#fff" />
      </>)
    case 'sleepy': // offline
      return <path d="M49 2.5h4.5L49 7.5h4.5M55.5 0h3l-3 3.4h3" stroke={INK} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".5" />
    default:
      return null
  }
}
