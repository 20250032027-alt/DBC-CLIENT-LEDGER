import { createContext, useContext, useState, useMemo, useCallback } from 'react'

const PROMPTED_KEY = 'dbc-ledger-tutorial-prompted' // has the first-time nudge ever shown?

function readStored(key, fallback) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

// ── Segments ──
// Deliberately a modest set for v1, not full page-by-page coverage —
// this proves the engine (spotlighting real elements, a safe sandbox for
// hands-on steps, free navigation between segments) end to end with a
// few genuinely useful segments, rather than spreading thin across every
// page in the app. Adding a new segment later is just adding another
// entry here; the player itself doesn't change.
//
// Step shape: { type: 'spotlight', target, title, body } highlights a
// real element already on screen and waits for a Next click (or, if
// `waitForClick: true`, waits for the person to click the real element
// itself — the actual hands-on part).
// { type: 'sandbox-voucher', title, body } opens the practice voucher
// form instead of touching anything real.
// { type: 'info', title, body } is just an explanation, no spotlight.
export const SEGMENTS = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    description: 'A quick look around — where things are and what they do',
    requiresPage: null, // no specific page/permission requirement
    steps: [
      { type: 'info', title: 'Welcome to DBC Ledger', body: "This'll only take a minute. We'll look at where things are, then actually practice recording something together — nothing you do in practice mode is ever saved for real." },
      { type: 'spotlight', target: 'sidebar-nav', title: 'Getting around', body: 'Everything is grouped by what it does — Vouchers for recording money in and out, Financial Reports for seeing how things add up over time.' },
      { type: 'spotlight', target: 'nav-dashboard', title: 'Dashboard', body: 'A quick snapshot of where things stand financially, any time you want it.' },
      { type: 'spotlight', target: 'nav-settings', title: 'Settings', body: "Company details, how the app looks, and this tutorial (if you ever want to run it again) all live here." },
      { type: 'spotlight', target: 'help-chat-fab', title: "If you ever get stuck", body: "Tap this any time — it knows this app and your actual numbers, and can walk you through things in plain language." },
    ],
  },
  {
    id: 'record-a-transaction',
    label: 'Recording a Transaction',
    description: 'Practice creating a voucher, hands-on — nothing here is saved',
    requiresPage: 'vouchers',
    steps: [
      { type: 'info', title: "Let's practice", body: "We'll walk through recording a transaction together. This is a practice copy of the real form — click around freely, nothing here gets saved anywhere." },
      { type: 'sandbox-voucher', title: 'Try it yourself', body: 'Pick a type, fill in an amount, and save it — just like the real thing.' },
      { type: 'info', title: "That's the whole idea", body: "A real voucher works exactly the same way. The only difference just now is that this one was never actually saved." },
    ],
  },
  {
    id: 'getting-help',
    label: 'Getting Help Later',
    description: "Where to go if you forget something",
    requiresPage: null,
    steps: [
      { type: 'spotlight', target: 'help-chat-fab', title: 'The chat bubble', body: "This is always here. Ask it anything about how the app works, or about your own numbers — it can see what you can see." },
      { type: 'info', title: "You're set", body: "You can run this tutorial again any time from Settings. No need to remember everything right now." },
    ],
  },
]

const TutorialContext = createContext(null)

export function TutorialProvider({ children }) {
  // 'idle' | 'nudge' | 'menu' | 'playing'
  const [mode, setMode] = useState('idle')
  const [segmentId, setSegmentId] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [hasPrompted, setHasPrompted] = useState(() => readStored(PROMPTED_KEY, '') === '1')

  const markPrompted = useCallback(() => {
    writeStored(PROMPTED_KEY, '1')
    setHasPrompted(true)
  }, [])

  // Called once after the real app has loaded for an approved account —
  // shows the nudge only if it's genuinely never been answered before on
  // this device. If someone closes the tab without clicking either
  // button, hasPrompted stays false and it'll reasonably show again next
  // time, since nothing was actually dismissed.
  const maybeNudge = useCallback(() => {
    if (!hasPrompted) setMode('nudge')
  }, [hasPrompted])

  const dismissNudge = useCallback(() => { markPrompted(); setMode('idle') }, [markPrompted])
  const acceptNudge = useCallback(() => { markPrompted(); setMode('menu') }, [markPrompted])
  const openMenu = useCallback(() => setMode('menu'), [])
  const closeTutorial = useCallback(() => { setMode('idle'); setSegmentId(null); setStepIndex(0) }, [])

  const startSegment = useCallback((id) => {
    setSegmentId(id)
    setStepIndex(0)
    setMode('playing')
  }, [])

  const currentSegment = useMemo(() => SEGMENTS.find(s => s.id === segmentId) || null, [segmentId])
  const currentStep = currentSegment ? currentSegment.steps[stepIndex] : null

  const nextStep = useCallback(() => {
    if (!currentSegment) return
    if (stepIndex + 1 < currentSegment.steps.length) {
      setStepIndex(i => i + 1)
    } else {
      setMode('menu') // segment finished — back to the picker, not fully closed, so hopping to another segment is one click
    }
  }, [currentSegment, stepIndex])

  const prevStep = useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1))
  }, [])

  const value = useMemo(() => ({
    mode, segmentId, stepIndex, currentSegment, currentStep,
    maybeNudge, dismissNudge, acceptNudge, openMenu, closeTutorial, startSegment, nextStep, prevStep,
  }), [mode, segmentId, stepIndex, currentSegment, currentStep, maybeNudge, dismissNudge, acceptNudge, openMenu, closeTutorial, startSegment, nextStep, prevStep])

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  )
}

export function useTutorial() {
  return useContext(TutorialContext)
}
