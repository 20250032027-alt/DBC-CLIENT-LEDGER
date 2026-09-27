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
    description: 'A quick look around',
    requiresPage: null,
    steps: [
      { type: 'info', title: 'Hi there!', body: "This will only take a minute. We'll look around together, then try recording something. Don't worry — nothing you do here is real. You can't break anything." },
      { type: 'spotlight', target: 'sidebar-nav', title: 'This is your menu', body: 'Everything you need is here. Vouchers is where you write down money in and money out.' },
      { type: 'spotlight', target: 'nav-dashboard', title: 'Dashboard', body: 'This page shows you a quick summary. Tap it any time to see how things look.' },
      { type: 'spotlight', target: 'nav-settings', title: 'Settings', body: 'You can change how the app looks here. You can also come back to this tutorial any time from here.' },
      { type: 'spotlight', target: 'help-chat-fab', title: 'Need help later?', body: "Tap this little bubble any time. You can ask it anything, in your own words, and it will help you." },
    ],
  },
  {
    id: 'record-a-transaction',
    label: 'Recording a Transaction',
    description: 'Try it yourself — nothing is saved',
    requiresPage: 'vouchers',
    steps: [
      { type: 'info', title: "Let's try it together", body: "Next, a practice form will open. It looks just like the real one. Follow the little blue instructions inside it, one step at a time. Nothing you do will be saved." },
      { type: 'sandbox-voucher', title: 'Try it yourself', body: '' },
      { type: 'info', title: "You did it!", body: "That's really all there is to it. The real form works exactly the same way." },
    ],
  },
  {
    id: 'getting-help',
    label: 'Getting Help Later',
    description: 'Where to go if you get stuck',
    requiresPage: null,
    steps: [
      { type: 'spotlight', target: 'help-chat-fab', title: 'Remember this bubble', body: "If you ever forget how something works, just tap here and ask. No question is a silly question." },
      { type: 'info', title: "All done!", body: "You can watch this tutorial again any time. Just go to Settings and tap Open Tutorial." },
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
