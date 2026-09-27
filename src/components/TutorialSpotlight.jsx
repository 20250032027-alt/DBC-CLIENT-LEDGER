import { useState, useEffect, useRef } from 'react'
import { useTutorial } from '../lib/tutorial.jsx'
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react'

// Finds the real element tagged data-tutorial="<target>" and measures it.
// Re-measures on resize/scroll so the ring stays correctly placed if the
// page moves under it.
function useTargetRect(target) {
  const [rect, setRect] = useState(null)
  useEffect(() => {
    if (!target) { setRect(null); return }
    function measure() {
      const el = document.querySelector(`[data-tutorial="${target}"]`)
      if (el) setRect(el.getBoundingClientRect())
      else setRect(null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const interval = setInterval(measure, 300) // covers layout shifts a resize/scroll event wouldn't catch
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      clearInterval(interval)
    }
  }, [target])
  return rect
}

export default function TutorialSpotlight() {
  const { mode, currentSegment, currentStep, stepIndex, nextStep, prevStep, closeTutorial, openMenu } = useTutorial()
  const isSandboxStep = currentStep?.type === 'sandbox-voucher'
  const target = currentStep?.type === 'spotlight' ? currentStep.target : null
  const rect = useTargetRect(target)

  // The sandbox step type is rendered by TutorialSandboxVoucher instead
  // (mounted alongside this in App.jsx) — this component just needs to
  // stay out of the way for that one step type, not render its own
  // overlay on top of it.
  if (mode !== 'playing' || !currentStep || isSandboxStep) return null

  const isLast = stepIndex === currentSegment.steps.length - 1
  const isFirst = stepIndex === 0
  const padding = 8

  return (
    <>
      {/* The ring — a tightly-fit box with a huge box-shadow standing in
          for a full-page overlay with a cutout. Simpler and more robust
          than computing four cutout rectangles by hand, and it doesn't
          touch the real element at all, so nothing about its own click
          handlers or transitions is disturbed. */}
      {rect && (
        <div style={{
          position: 'fixed', zIndex: 1200, pointerEvents: 'none',
          top: rect.top - padding, left: rect.left - padding,
          width: rect.width + padding * 2, height: rect.height + padding * 2,
          borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          border: '2px solid var(--accent)', transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
        }} />
      )}
      {/* No target found (e.g. sidebar collapsed and hiding a label, or
          the element genuinely isn't on this page) — still darken the
          page and show the explanation, just without a ring pointing at
          nothing. */}
      {!rect && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
      )}

      <div style={{
        position: 'fixed', zIndex: 1201, bottom: 20, left: '50%', transform: 'translateX(-50%)',
        width: 360, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface)',
        border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
        padding: '16px 18px', animation: 'message-in 0.2s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
            {currentSegment.label} — {stepIndex + 1} of {currentSegment.steps.length}
          </div>
          <button className="icon-btn" onClick={closeTutorial} title="Close tutorial"><X size={14} /></button>
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 5 }}>{currentStep.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 14 }}>{currentStep.body}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={openMenu}>
            All segments
          </button>
          <div style={{ flex: 1 }} />
          {!isFirst && (
            <button className="btn btn-ghost btn-sm" onClick={prevStep}><ArrowLeft size={13} /> Back</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={nextStep}>
            {isLast ? <>Done <Check size={13} /></> : <>Next <ArrowRight size={13} /></>}
          </button>
        </div>
      </div>
    </>
  )
}
