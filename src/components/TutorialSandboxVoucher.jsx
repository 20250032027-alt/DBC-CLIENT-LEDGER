import { useState } from 'react'
import { useStore } from '../store/useStore.jsx'
import { useTutorial } from '../lib/tutorial.jsx'
import { fmt } from '../utils'
import { X, FlaskConical, ArrowRight, Lightbulb } from 'lucide-react'

const TYPES = ['General Journal', 'Cash Voucher', 'Receipt Journal', 'Sales Voucher']

function blankLine() { return { account: '', debit: '', credit: '' } }

// A live, always-visible instruction that updates as the person fills
// the form in — this is the direct fix for "I don't know what to do
// next, so I'm just pressing random buttons." Rather than one static
// blurb shown once before the form opens, this tracks exactly where
// they are and says the next single thing to do, in plain words.
function getGuidance(lines, balanced) {
  if (!lines[0].account) return { text: "Pick an account for the first line. Try Cash.", line: 0 }
  if (!lines[0].debit && !lines[0].credit) return { text: 'Now type a number under Debit or Credit for that line.', line: 0 }
  if (!lines[1].account) return { text: 'Good! Now pick an account for the second line.', line: 1 }
  if (!lines[1].debit && !lines[1].credit) return { text: 'Now type the same number in the other box for this line.', line: 1 }
  if (!balanced) return { text: 'Almost there — make the two totals below match.', line: null }
  return { text: 'You did it! Tap Save (Practice) below.', line: null }
}

export default function TutorialSandboxVoucher() {
  const { accounts } = useStore()
  const { mode, currentStep, nextStep, closeTutorial } = useTutorial()
  const [type, setType] = useState(TYPES[0])
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState([blankLine(), blankLine()])
  const [saved, setSaved] = useState(false)

  if (mode !== 'playing' || currentStep?.type !== 'sandbox-voucher') return null

  if (accounts.length === 0) {
    return (
      <div className="modal-backdrop">
        <div className="modal" style={{ maxWidth: 440 }}>
          <div className="modal-header">
            <span className="modal-title" style={{ fontSize: 18 }}>Almost ready</span>
            <button className="icon-btn" onClick={closeTutorial}><X size={18} /></button>
          </div>
          <div style={{ fontSize: 15, color: 'var(--text-1)', lineHeight: 1.6, marginBottom: 4 }}>
            This practice form uses your real Chart of Accounts to pick from — but it looks like
            there aren't any set up yet. Head to Chart of Accounts first, then come back here to
            try this.
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={closeTutorial} style={{ width: '100%' }}>Got it</button>
          </div>
        </div>
      </div>
    )
  }

  function updateLine(i, field, value) {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }
  function addLine() { setLines(ls => [...ls, blankLine()]) }

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01
  const guidance = getGuidance(lines, balanced)

  function handleSave() {
    setSaved(true) // nothing is written anywhere — purely a practice confirmation
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 14,
          background: 'var(--amber-dim)', color: 'var(--amber)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
        }}>
          <FlaskConical size={15} /> Practice — nothing here gets saved
        </div>

        <div className="modal-header">
          <span className="modal-title" style={{ fontSize: 18 }}>{saved ? 'Nice work!' : 'New Voucher (Practice)'}</span>
          <button className="icon-btn" onClick={closeTutorial}><X size={18} /></button>
        </div>

        {!saved ? (
          <>
            {/* The live instruction — always in the same spot, always
                telling them the one next thing to do. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 16,
              background: 'var(--accent-subtle)', border: '1px solid var(--accent-glow)', borderRadius: 'var(--radius-sm)',
            }}>
              <Lightbulb size={17} color="var(--accent)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-1)' }}>{guidance.text}</span>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Memo (optional)</label>
                <input className="form-input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="What's this for?" />
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: '10px 0 6px' }}>Entries</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', gap: 8, padding: 6, borderRadius: 'var(--radius-sm)',
                    background: guidance.line === i ? 'var(--accent-subtle)' : 'transparent',
                    border: guidance.line === i ? '1px solid var(--accent-glow)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <select className="form-select" style={{ flex: 2 }} value={line.account} onChange={e => updateLine(i, 'account', e.target.value)}>
                    <option value="">Pick an account...</option>
                    {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                  <input className="form-input" style={{ flex: 1 }} type="number" placeholder="Debit" value={line.debit}
                    onChange={e => updateLine(i, 'debit', e.target.value)} />
                  <input className="form-input" style={{ flex: 1 }} type="number" placeholder="Credit" value={line.credit}
                    onChange={e => updateLine(i, 'credit', e.target.value)} />
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addLine}>+ Add Line</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginTop: 14, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span>Debit: <strong>{fmt(totalDebit)}</strong></span>
              <span>Credit: <strong>{fmt(totalCredit)}</strong></span>
              <span style={{ color: balanced ? 'var(--green)' : 'var(--text-3)', fontWeight: balanced ? 700 : 400 }}>
                {balanced ? '✓ Matched' : 'Not matched yet'}
              </span>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeTutorial}>Cancel</button>
              <button className="btn btn-primary" disabled={!balanced} onClick={handleSave}>Save (Practice)</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, color: 'var(--text-1)', lineHeight: 1.6, marginBottom: 4 }}>
              That's it! The real form works just like this one. Pick a type, make the two totals
              match, then save.
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={nextStep} style={{ width: '100%' }}>
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
