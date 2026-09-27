import { useState, useEffect } from 'react'
import { useTutorial } from '../lib/tutorial.jsx'
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react'

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
    const interval = setInterval(measure, 300)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      clearInterval(interval)
    }
  }, [target])
  return rect
}

const TOOLTIP_W = 320
const TOOLTIP_H_ESTIMATE = 190
const MARGIN = 16

// Keeps the explanation actually next to whatever's highlighted, instead
// of parked in a fixed corner the eye has to keep jumping back and forth
// to find. Tries right, then below, then left, then above — whichever
// direction actually has room — and only falls back to a centered
// position if the target is somewhere genuinely cramped.
function computeTooltipPosition(rect) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const spaceRight = vw - rect.right
  const spaceLeft = rect.left
  const spaceBelow = vh - rect.bottom
  const spaceAbove = rect.top

  if (spaceRight >= TOOLTIP_W + MARGIN) {
    return { left: rect.right + MARGIN, top: clamp(rect.top, MARGIN, vh - TOOLTIP_H_ESTIMATE - MARGIN) }
  }
  if (spaceBelow >= TOOLTIP_H_ESTIMATE + MARGIN) {
    return { top: rect.bottom + MARGIN, left: clamp(rect.left, MARGIN, vw - TOOLTIP_W - MARGIN) }
  }
  if (spaceLeft >= TOOLTIP_W + MARGIN) {
    return { left: rect.left - TOOLTIP_W - MARGIN, top: clamp(rect.top, MARGIN, vh - TOOLTIP_H_ESTIMATE - MARGIN) }
  }
  if (spaceAbove >= TOOLTIP_H_ESTIMATE + MARGIN) {
    return { top: rect.top - TOOLTIP_H_ESTIMATE - MARGIN, left: clamp(rect.left, MARGIN, vw - TOOLTIP_W - MARGIN) }
  }
  return { top: (vh - TOOLTIP_H_ESTIMATE) / 2, left: (vw - TOOLTIP_W) / 2 }
}
function clamp(v, min, max) { return Math.max(min, Math.min(v, max)) }

export default function TutorialSpotlight() {
  const { mode, currentSegment, currentStep, stepIndex, nextStep, prevStep, closeTutorial } = useTutorial()
  const isSandboxStep = currentStep?.type === 'sandbox-voucher'
  const target = currentStep?.type === 'spotlight' ? currentStep.target : null
  const rect = useTargetRect(target)

  if (mode !== 'playing' || !currentStep || isSandboxStep) return null

  const isLast = stepIndex === currentSegment.steps.length - 1
  const isFirst = stepIndex === 0
  const padding = 8

  // Info steps (no real element to point at) center the card — nothing
  // to visually connect to, so a fixed centered position is the clearest
  // choice there, not a placement algorithm with nothing to anchor to.
  const position = rect ? computeTooltipPosition(rect) : null

  return (
    <>
      {rect && (
        <div style={{
          position: 'fixed', zIndex: 1200, pointerEvents: 'none',
          top: rect.top - padding, left: rect.left - padding,
          width: rect.width + padding * 2, height: rect.height + padding * 2,
          borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          border: '2px solid var(--accent)', transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
        }} />
      )}
      {!rect && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
      )}

      <div style={{
        position: 'fixed', zIndex: 1201,
        ...(position
          ? { top: position.top, left: position.left }
          : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
        width: TOOLTIP_W, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface)',
        border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
        padding: '18px 20px', animation: 'message-in 0.2s ease',
      }}>
        <button className="icon-btn" onClick={closeTutorial} title="Close" style={{ position: 'absolute', top: 10, right: 10 }}>
          <X size={16} />
        </button>

        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, paddingRight: 24 }}>{currentStep.title}</div>
        <div style={{ fontSize: 15, color: 'var(--text-1)', lineHeight: 1.6, marginBottom: 16 }}>{currentStep.body}</div>

        {/* Dots instead of "2 of 5" text — quicker to read at a glance, less to parse */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
          {currentSegment.steps.map((_, i) => (
            <div key={i} style={{
              width: i === stepIndex ? 18 : 6, height: 6, borderRadius: 99,
              background: i === stepIndex ? 'var(--accent)' : 'var(--border2)', transition: 'all 0.2s ease',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {!isFirst && (
            <button className="btn btn-ghost btn-sm" onClick={prevStep} style={{ flex: 1 }}><ArrowLeft size={14} /> Back</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={nextStep} style={{ flex: isFirst ? 1 : 1 }}>
            {isLast ? <>Done <Check size={14} /></> : <>Next <ArrowRight size={14} /></>}
          </button>
        </div>
      </div>
    </>
  )
}
