import { useState } from 'react'
import { useStore } from '../store/useStore.jsx'
import { useTutorial } from '../lib/tutorial.jsx'
import { fmt } from '../utils'
import { X, FlaskConical, ArrowRight, Check } from 'lucide-react'

const TYPES = ['General Journal', 'Cash Voucher', 'Receipt Journal', 'Sales Voucher']

function blankLine() { return { account: '', debit: '', credit: '' } }

// A real-looking voucher form that writes to nothing but its own local
// state — never calls addVoucher, never touches the store or Supabase.
// Uses the account's REAL chart of accounts (read-only) so practicing
// feels like using the actual thing, not a generic mockup with made-up
// account names.
export default function TutorialSandboxVoucher() {
  const { accounts } = useStore()
  const { mode, currentStep, nextStep, closeTutorial, openMenu } = useTutorial()
  const [type, setType] = useState(TYPES[0])
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState([blankLine(), blankLine()])
  const [saved, setSaved] = useState(false)

  if (mode !== 'playing' || currentStep?.type !== 'sandbox-voucher') return null

  function updateLine(i, field, value) {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }
  function addLine() { setLines(ls => [...ls, blankLine()]) }

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01

  function handleSave() {
    setSaved(true) // nothing is written anywhere — this is purely a practice confirmation
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 14,
          background: 'var(--amber-dim)', color: 'var(--amber)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 600,
        }}>
          <FlaskConical size={14} /> Practice Mode — nothing here gets saved
        </div>

        <div className="modal-header">
          <span className="modal-title">{saved ? 'Nicely done' : 'New Voucher (Practice)'}</span>
          <button className="icon-btn" onClick={closeTutorial}><X size={18} /></button>
        </div>

        {!saved ? (
          <>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Memo</label>
                <input className="form-input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="What's this for?" />
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: '10px 0 6px' }}>Entries</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <select className="form-select" style={{ flex: 2 }} value={line.account} onChange={e => updateLine(i, 'account', e.target.value)}>
                    <option value="">Select an account...</option>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 14, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span>Debit: <strong>{fmt(totalDebit)}</strong></span>
              <span>Credit: <strong>{fmt(totalCredit)}</strong></span>
              <span style={{ color: balanced ? 'var(--green)' : 'var(--text-3)' }}>
                {balanced ? '✓ Balanced' : 'Debits must equal credits'}
              </span>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeTutorial}>Cancel</button>
              <button className="btn btn-primary" disabled={!balanced} onClick={handleSave}>Save (Practice)</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 4 }}>
              That's exactly how it works for real — pick a type, enter matching debits and credits, save. The only
              difference just now is this one was never actually written anywhere.
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={openMenu}>All segments</button>
              <button className="btn btn-primary" onClick={nextStep}>
                Continue <ArrowRight size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
