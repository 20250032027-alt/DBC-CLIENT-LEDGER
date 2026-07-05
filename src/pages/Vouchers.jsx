import { useState, useRef, useEffect, Fragment } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate, voucherTotals } from '../utils'
import { Plus, X, Trash2, Pencil, Search, CheckCircle, AlertCircle, FileText, Download, BookMarked, ChevronDown, ChevronUp, Delete, Calculator } from 'lucide-react'

const TYPES = ['sales', 'general', 'cash receipt', 'cash disbursement', 'expense', 'adjustment']

const MONEY_FMT = '#,##0.00;(#,##0.00);"-"'

function setColumnMoneyFormat(XLSX, ws, rowCount, colIndexes) {
  colIndexes.forEach(c => {
    for (let r = 0; r < rowCount; r++) {
      const ref = XLSX.utils.encode_cell({ r: r + 1, c }) // +1 to skip header row
      if (ws[ref]) ws[ref].z = MONEY_FMT
    }
  })
}

async function exportVouchersToExcel(vouchers, clients) {
  const XLSX = await import('xlsx')
  const clientName = id => clients.find(c => c.id === id)?.name || ''

  const summaryRows = vouchers.map(v => {
    const { debit, credit, balanced } = voucherTotals(v.entries)
    const entries = v.entries || []
    const debitBreakdown = entries.filter(e => parseFloat(e.debit || 0) > 0)
      .map(e => `${e.account}: ${parseFloat(e.debit).toFixed(2)}`).join('; ')
    const creditBreakdown = entries.filter(e => parseFloat(e.credit || 0) > 0)
      .map(e => `${e.account}: ${parseFloat(e.credit).toFixed(2)}`).join('; ')
    return {
      'Voucher #': v.number,
      Type: v.type,
      Date: v.date || fmtDate(v.createdAt),
      Reference: v.reference || '',
      Client: clientName(v.clientId),
      Memo: v.memo || '',
      'Debit Breakdown': debitBreakdown,
      'Credit Breakdown': creditBreakdown,
      'Debit Total': debit,
      'Credit Total': credit,
      Balanced: balanced ? 'Yes' : 'No',
    }
  })

  const entryRows = []
  vouchers.forEach(v => {
    ;(v.entries || []).forEach(e => {
      entryRows.push({
        'Voucher #': v.number,
        Date: v.date || fmtDate(v.createdAt),
        Account: e.account || '',
        Description: e.description || '',
        Debit: parseFloat(e.debit || 0),
        Credit: parseFloat(e.credit || 0),
      })
    })
  })

  const wb = XLSX.utils.book_new()

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  setColumnMoneyFormat(XLSX, wsSummary, summaryRows.length, [8, 9])
  wsSummary['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 18 }, { wch: 28 }, { wch: 34 }, { wch: 34 },
    { wch: 13 }, { wch: 13 }, { wch: 9 },
  ]

  const wsEntries = XLSX.utils.json_to_sheet(entryRows)
  setColumnMoneyFormat(XLSX, wsEntries, entryRows.length, [4, 5])
  wsEntries['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 13 }, { wch: 13 },
  ]

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Vouchers')
  XLSX.utils.book_append_sheet(wb, wsEntries, 'Entries')

  const dateStr = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `dbc-client-ledger-vouchers-${dateStr}.xlsx`)
}

function AccountAutocomplete({ value, onChange, onFocus, accounts, placeholder, style }) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const itemRefs = useRef([])

  const q = value.trim().toLowerCase()
  const suggestions = q.length === 0 ? [] : accounts
    .filter(a => a.name.toLowerCase().includes(q) || (a.code || '').toLowerCase().startsWith(q))
    .slice(0, 8)

  useEffect(() => { setHighlighted(0) }, [q])

  // Scroll highlighted item into view when navigating with keyboard
  useEffect(() => {
    if (open && itemRefs.current[highlighted]) {
      itemRefs.current[highlighted].scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted, open])

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(name) {
    onChange(name)
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); select(suggestions[highlighted].name) }
    else if (e.key === 'Escape') { setOpen(false) }
    else if (e.key === 'Tab') { if (suggestions.length > 0) select(suggestions[highlighted].name) }
  }

  const accountNames = new Set(accounts.map(a => a.name.trim().toLowerCase()))
  const isInvalid = value.trim().length > 0 && !accountNames.has(value.trim().toLowerCase())

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="form-input"
        style={{
          ...style,
          borderColor: isInvalid ? 'var(--red)' : open && suggestions.length > 0 ? 'var(--accent)' : undefined,
          background: isInvalid ? 'rgba(239,68,68,0.07)' : undefined,
        }}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); if (onFocus) onFocus() }}
        onKeyDown={handleKeyDown}
      />
      {isInvalid && !open && (
        <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2, lineHeight: 1.3 }}>
          ⚠ Not in Chart of Accounts
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--surface2)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          zIndex: 1000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'auto',
          maxHeight: 260,
          marginTop: 2,
        }}>
          {suggestions.map((a, i) => (
            <div
              key={a.id}
              ref={el => { itemRefs.current[i] = el }}
              onMouseDown={() => select(a.name)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                background: i === highlighted ? 'var(--accent-glow)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                outline: i === highlighted ? '1px solid var(--accent)' : 'none',
                outlineOffset: -1,
              }}
            >
              <span style={{ fontSize: 12, color: i === highlighted ? 'var(--text-1)' : 'var(--text-2)' }}>
                {a.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginLeft: 8 }}>
                {a.code && `${a.code} · `}{a.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MemoAutocomplete({ value, onChange, recentMemos, placeholder, style }) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const itemRefs = useRef([])

  value = value || ''
  const q = value.trim().toLowerCase()
  const suggestions = recentMemos.filter(m => m.toLowerCase().includes(q) && m !== value).slice(0, 6)

  useEffect(() => { setHighlighted(0) }, [q])

  // Scroll highlighted item into view when navigating with keyboard
  useEffect(() => {
    if (open && itemRefs.current[highlighted]) {
      itemRefs.current[highlighted].scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted, open])

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(memo) { onChange(memo); setOpen(false) }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); select(suggestions[highlighted]) }
    else if (e.key === 'Escape') { setOpen(false) }
    else if (e.key === 'Tab') { if (suggestions.length > 0) { e.preventDefault(); select(suggestions[highlighted]) } }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <input autoFocus className="form-input" value={value}
        style={style}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--surface2)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          zIndex: 1000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'auto',
          maxHeight: 220,
          marginTop: 2,
        }}>
          {suggestions.map((m, i) => (
            <div key={i}
              ref={el => { itemRefs.current[i] = el }}
              onMouseDown={() => select(m)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '8px 10px', cursor: 'pointer', fontSize: 12,
                background: i === highlighted ? 'var(--accent-glow)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                color: i === highlighted ? 'var(--text-1)' : 'var(--text-2)',
                outline: i === highlighted ? '1px solid var(--accent)' : 'none',
                outlineOffset: -1,
              }}>
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EntryRow({ entry, onChange, onRemove, onAddBelow, accounts, isLast, index, onFocus }) {
  // Tab on last credit field → add new row
  function handleCreditKeyDown(e) {
    if (e.key === 'Tab' && !e.shiftKey && isLast) {
      e.preventDefault()
      onAddBelow()
    }
  }

  return (
    <tr>
      <td style={{ position: 'relative' }}>
        <AccountAutocomplete
          value={entry.account}
          onChange={v => onChange({ ...entry, account: v })}
          onFocus={() => onFocus(index, 'debit')}
          accounts={accounts}
          placeholder="Account name"
          style={{ fontSize: 12, padding: '5px 8px' }}
        />
      </td>
      <td>
        <input
          className="form-input"
          style={{ fontSize: 12, padding: '5px 8px' }}
          value={entry.description}
          onChange={e => onChange({ ...entry, description: e.target.value })}
          placeholder="Description"
        />
      </td>
      <td>
        <input
          className="form-input"
          style={{ fontSize: 12, padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}
          type="number" min="0" step="0.01" value={entry.debit}
          onFocus={() => onFocus(index, 'debit')}
          onChange={e => onChange({ ...entry, debit: e.target.value, credit: e.target.value ? '' : entry.credit })}
          placeholder="0.00"
        />
      </td>
      <td>
        <input
          className="form-input"
          style={{ fontSize: 12, padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}
          type="number" min="0" step="0.01" value={entry.credit}
          onFocus={() => onFocus(index, 'credit')}
          onChange={e => onChange({ ...entry, credit: e.target.value, debit: e.target.value ? '' : entry.debit })}
          onKeyDown={handleCreditKeyDown}
          placeholder="0.00"
        />
      </td>
      <td>
        <button className="icon-btn" onClick={onRemove} style={{ color: 'var(--red)' }}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
}

// ── Accounting Calculator ─────────────────────────────────────────────────
function AccountingCalc({ onUseDebit, onUseCredit, taxRate = 12 }) {
  const [display, setDisplay] = useState('0')
  const [tape, setTape]       = useState([]) // [{expr, result}]
  const [expr, setExpr]       = useState('')  // pending expression string
  const [justEvaled, setJustEvaled] = useState(false)
  const [splitN, setSplitN]   = useState('2')
  const [mode, setMode]       = useState('calc') // 'calc' | 'split' | 'tax'
  const [taxMode, setTaxMode] = useState('excl') // 'excl' (add tax) | 'incl' (strip tax)

  const MAX_TAPE = 8

  function safeEval(str) {
    try {
      // Replace × and ÷ with JS operators
      const clean = str.replace(/×/g,'*').replace(/÷/g,'/')
      // Only allow safe chars
      if (!/^[\d\s\+\-\*\/\.\(\)]+$/.test(clean)) return null
      // eslint-disable-next-line no-new-func
      const result = Function('"use strict"; return (' + clean + ')')()
      if (!isFinite(result)) return null
      return Math.round(result * 100) / 100
    } catch { return null }
  }

  function pushTape(expression, result) {
    setTape(t => [{expr: expression, result},...t].slice(0, MAX_TAPE))
  }

  function pressDigit(d) {
    if (justEvaled) { setDisplay(d); setExpr(d); setJustEvaled(false); return }
    const next = display === '0' && d !== '.' ? d : display + d
    setDisplay(next)
    setExpr(e => e + d)
  }

  function pressOp(op) {
    setJustEvaled(false)
    // Evaluate any pending expression first
    const result = safeEval(expr)
    if (result !== null) {
      const numStr = String(result)
      setDisplay(numStr)
      setExpr(numStr + op)
      pushTape(expr, result)
    } else {
      setExpr(e => e + op)
    }
    setDisplay('0')
  }

  function pressEqual() {
    const result = safeEval(expr)
    if (result === null) return
    pushTape(expr + ' =', result)
    setDisplay(String(result))
    setExpr(String(result))
    setJustEvaled(true)
  }

  function pressClear() {
    setDisplay('0'); setExpr(''); setJustEvaled(false)
  }

  function pressBackspace() {
    if (justEvaled) { pressClear(); return }
    const next = display.length > 1 ? display.slice(0, -1) : '0'
    setDisplay(next)
    setExpr(e => e.length > 1 ? e.slice(0, -1) : '')
  }

  function pressPercent() {
    const val = parseFloat(display)
    if (isNaN(val)) return
    const result = Math.round(val / 100 * 100) / 100
    setDisplay(String(result))
    setExpr(String(result))
    setJustEvaled(true)
  }

  function pressDot() {
    if (display.includes('.')) return
    setDisplay(d => d + '.')
    setExpr(e => e + '.')
  }

  function useTape(val) {
    const s = String(val)
    setDisplay(s); setExpr(s); setJustEvaled(true)
  }

  const currentVal = parseFloat(display) || 0

  // Split
  const splitAmt = splitN && parseFloat(splitN) > 0
    ? Math.round(currentVal / parseFloat(splitN) * 100) / 100
    : 0

  // Tax
  const taxDec = taxRate / 100
  const taxExcl = Math.round(currentVal * taxDec * 100) / 100          // tax on top of net
  const netFromGross = Math.round(currentVal / (1 + taxDec) * 100) / 100 // strip tax from gross
  const taxFromGross = Math.round((currentVal - netFromGross) * 100) / 100

  const btnBase = {
    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
    fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 14,
    transition: 'all 0.1s', padding: '10px 0', userSelect: 'none',
  }
  const btnNum  = { ...btnBase, background: 'var(--surface3)', color: 'var(--text-1)' }
  const btnOp   = { ...btnBase, background: 'var(--surface2)', color: 'var(--accent)', fontSize: 16 }
  const btnEq   = { ...btnBase, background: 'var(--accent)', color: '#fff', fontSize: 16 }
  const btnSpec = { ...btnBase, background: 'var(--surface2)', color: 'var(--text-2)', fontSize: 12 }

  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }

  return (
    <div className="accounting-calc" style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
      alignSelf: 'flex-start',
    }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
        {[['calc','Calc'],['split','Split'],['tax','Tax']].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: '4px 0', border: 'none', borderRadius: 'var(--radius-sm)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
            background: mode === m ? 'var(--accent)' : 'transparent',
            color: mode === m ? '#fff' : 'var(--text-3)',
          }}>{label}</button>
        ))}
      </div>

      {/* Display */}
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
        padding: '10px 12px', textAlign: 'right', minHeight: 52,
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', minHeight: 14, wordBreak: 'break-all' }}>
          {expr || ' '}
        </div>
        <div style={{ fontSize: 22, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text-1)', letterSpacing: -1 }}>
          {parseFloat(display).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </div>
      </div>

      {mode === 'calc' && <>
        {/* Buttons */}
        <div style={grid4}>
          {[
            ['C','spec'], ['del','spec'], ['%','spec'], ['÷','op'],
            ['7','num'],  ['8','num'],  ['9','num'],  ['×','op'],
            ['4','num'],  ['5','num'],  ['6','num'],  ['−','op'],
            ['1','num'],  ['2','num'],  ['3','num'],  ['+','op'],
            ['0','num'],  ['.','num'],  ['=','eq'],   ['=','eq'],
          ].map(([k, t], i) => {
            // Skip duplicate '=' (it spans 2 cols)
            if (i === 19) return null
            const isEqSpan = i === 18
            const style = t === 'op' ? btnOp : t === 'eq' ? btnEq : t === 'spec' ? btnSpec : btnNum
            return (
              <button key={i} style={{ ...style, gridColumn: isEqSpan ? 'span 2' : undefined }}
                onClick={() => {
                  if (k === 'C') pressClear()
                  else if (k === 'del') pressBackspace()
                  else if (k === '%') pressPercent()
                  else if (k === '.') pressDot()
                  else if (k === '=') pressEqual()
                  else if (['+','−','×','÷'].includes(k)) pressOp(k === '−' ? '-' : k)
                  else pressDigit(k)
                }}>
                {k === 'del' ? <Delete size={14} /> : k}
              </button>
            )
          })}
        </div>

        {/* Use result buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, justifyContent: 'center' }}
            onClick={() => onUseDebit(currentVal)}>
            → DR
          </button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, justifyContent: 'center' }}
            onClick={() => onUseCredit(currentVal)}>
            → CR
          </button>
        </div>

        {/* Tape */}
        {tape.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>History</div>
            {tape.map((t, i) => (
              <div key={i} onClick={() => useTape(t.result)}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                <span style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{t.expr}</span>
                <span style={{ color: 'var(--text-2)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{t.result.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
              </div>
            ))}
            <button onClick={() => setTape([])} style={{ ...btnSpec, fontSize: 10, width: '100%', marginTop: 5, padding: '4px 0' }}>Clear history</button>
          </div>
        )}
      </>}

      {mode === 'split' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Split the displayed amount evenly</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>÷</span>
            <input className="form-input" type="number" min="2" max="99" value={splitN}
              onChange={e => setSplitN(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', width: 70, fontFamily: 'var(--mono)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>parts</span>
          </div>
          {splitAmt > 0 && (
            <>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>Each part</div>
                <div style={{ fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>
                  {splitAmt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                  × {splitN} = {(splitAmt * parseFloat(splitN)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  {Math.abs(splitAmt * parseFloat(splitN) - currentVal) > 0.01
                    ? ` (±${(currentVal - splitAmt * parseFloat(splitN)).toFixed(2)} rounding)`
                    : ''}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, justifyContent: 'center' }}
                  onClick={() => onUseDebit(splitAmt)}>→ DR</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, justifyContent: 'center' }}
                  onClick={() => onUseCredit(splitAmt)}>→ CR</button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'tax' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
            {[['excl','Add VAT'],['incl','Strip VAT']].map(([m, label]) => (
              <button key={m} onClick={() => setTaxMode(m)} style={{
                flex: 1, padding: '4px 0', border: 'none', borderRadius: 'var(--radius-sm)',
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                background: taxMode === m ? 'var(--surface3)' : 'transparent',
                color: taxMode === m ? 'var(--text-1)' : 'var(--text-3)',
              }}>{label}</button>
            ))}
          </div>

          {taxMode === 'excl' ? (
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Row label="Net amount" val={currentVal} />
              <Row label={`VAT (${taxRate}%)`} val={taxExcl} color="var(--amber)" />
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <Row label="Gross total" val={currentVal + taxExcl} bold />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 4 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, justifyContent: 'center' }}
                  onClick={() => onUseDebit(taxExcl)}>VAT → DR</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, justifyContent: 'center' }}
                  onClick={() => onUseDebit(currentVal + taxExcl)}>Total → DR</button>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Row label="Gross (VAT-incl)" val={currentVal} />
              <Row label="Net (excl VAT)" val={netFromGross} color="var(--green)" />
              <Row label={`VAT portion (${taxRate}%)`} val={taxFromGross} color="var(--amber)" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 4 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, justifyContent: 'center' }}
                  onClick={() => onUseDebit(netFromGross)}>Net → DR</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, justifyContent: 'center' }}
                  onClick={() => onUseDebit(taxFromGross)}>VAT → DR</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, val, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: bold ? 700 : 500, color: color || 'var(--text-1)' }}>
        {val.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}

// Finds the closest matching Chart of Accounts name (case-insensitive), or
// falls back to the preferred label so the entry line is still usable —
// AccountAutocomplete will flag it with a warning if it's not really in the COA.
function findAccountName(preferred, accounts) {
  const match = accounts.find(a => a.name.trim().toLowerCase() === preferred.toLowerCase())
  return match ? match.name : preferred
}

// ── Sales tax panel ─────────────────────────────────────────────────────
// Shown only for the "Sales" voucher type. The tax scheme (VAT vs
// Percentage Tax) is a company-level setting (Settings page) — per BIR
// rules a business is registered as one or the other, not switchable per
// voucher. This panel just reads that setting, computes the numbers, and
// can drop the resulting lines straight into the entries table so Tax Due
// actually posts to the ledger instead of being a display-only figure.
function SalesTaxPanel({ settings, accounts, onAddLines }) {
  const [amount, setAmount] = useState('')
  const [amountType, setAmountType] = useState('net') // 'net' (VAT-exclusive) | 'gross' (VAT-inclusive) — VAT only
  const [receiptAccount, setReceiptAccount] = useState('Cash')

  const scheme = settings?.taxScheme === 'percentage' ? 'percentage' : 'vat'
  const rate = scheme === 'vat' ? (settings?.vatRate ?? 12) : (settings?.percentageTaxRate ?? 3)
  const gross0 = parseFloat(amount) || 0

  let netSales, taxDue, total
  if (scheme === 'vat') {
    if (amountType === 'gross') {
      netSales = Math.round(gross0 / (1 + rate / 100) * 100) / 100
      taxDue = Math.round((gross0 - netSales) * 100) / 100
      total = gross0
    } else {
      netSales = gross0
      taxDue = Math.round(netSales * (rate / 100) * 100) / 100
      total = Math.round((netSales + taxDue) * 100) / 100
    }
  } else {
    // Percentage tax is computed on gross receipts/sales — there's no
    // VAT-style "exclusive" concept here.
    netSales = gross0
    taxDue = Math.round(netSales * (rate / 100) * 100) / 100
    total = netSales // percentage tax is not added on top of the sale price the customer pays
  }

  const taxAccountLabel = scheme === 'vat' ? 'VAT Payable' : 'Percentage Tax Payable'

  function addLines() {
    if (gross0 <= 0) return
    const lines = [
      { account: findAccountName(receiptAccount, accounts), description: 'Sale proceeds', debit: String(total), credit: '' },
      { account: findAccountName('Sales Revenue', accounts), description: 'Net sales', debit: '', credit: String(netSales) },
    ]
    if (taxDue > 0) {
      lines.push({ account: findAccountName(taxAccountLabel, accounts), description: `${scheme === 'vat' ? 'Output VAT' : 'Percentage tax'} due`, debit: '', credit: String(taxDue) })
    }
    onAddLines(lines)
  }

  return (
    <div style={{
      marginBottom: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      padding: 12, background: 'var(--surface2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Sales Tax</div>
        <span className="badge badge-blue" style={{ fontSize: 10 }}>
          {scheme === 'vat' ? `VAT — ${rate}%` : `Percentage Tax — ${rate}%`}
        </span>
      </div>

      <div className="form-grid" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label className="form-label">{scheme === 'vat' ? 'Sale Amount' : 'Gross Sales / Receipts'}</label>
          <input className="form-input" type="number" min="0" step="0.01" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        {scheme === 'vat' ? (
          <div className="form-group">
            <label className="form-label">Amount is</label>
            <select className="form-select" value={amountType} onChange={e => setAmountType(e.target.value)}>
              <option value="net">Net of VAT (VAT-exclusive)</option>
              <option value="gross">VAT-inclusive (total)</option>
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Deposited/Received to</label>
            <select className="form-select" value={receiptAccount} onChange={e => setReceiptAccount(e.target.value)}>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="Accounts Receivable">Accounts Receivable</option>
            </select>
          </div>
        )}
        {scheme === 'vat' && (
          <div className="form-group">
            <label className="form-label">Deposited/Received to</label>
            <select className="form-select" value={receiptAccount} onChange={e => setReceiptAccount(e.target.value)}>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="Accounts Receivable">Accounts Receivable</option>
            </select>
          </div>
        )}
      </div>

      {gross0 > 0 && (
        <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          <Row label="Net Sales" val={netSales} />
          <Row label={`Tax Due (${taxAccountLabel})`} val={taxDue} color="var(--amber)" />
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            <Row label={scheme === 'vat' ? 'Total (collected)' : 'Total'} val={total} bold />
          </div>
        </div>
      )}

      <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} disabled={gross0 <= 0} onClick={addLines}>
        <Plus size={12} /> Add these lines to the voucher
      </button>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
        Registration type and rate are set once in Settings — they apply to every Sales voucher.
      </div>
    </div>
  )
}

function VoucherModal({ voucher, onClose, onSave, clients, accounts, templates, onSaveTemplate, onDeleteTemplate, recentMemos, settings }) {
  const blankEntry = () => ({ account: '', description: '', debit: '', credit: '', id: crypto.randomUUID() })
  const [form, setForm] = useState(voucher ? { ...voucher, memo: voucher.memo || '' } : {
    type: 'general', date: new Date().toISOString().slice(0, 10),
    reference: '', memo: '', clientId: '', entries: [blankEntry(), blankEntry()],
  })
  const [lastFocused, setLastFocused] = useState({ index: 0, side: 'debit' })

  // Calculator is hidden by default — toggled via the header button
  const [showCalc, setShowCalc] = useState(false)

  // Template UI state
  const [showTemplates, setShowTemplates] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setEntry(i, e) {
    const entries = [...form.entries]
    entries[i] = e
    setF('entries', entries)
  }
  function removeEntry(i) {
    setF('entries', form.entries.filter((_, idx) => idx !== i))
  }
  function addEntry() { setF('entries', [...form.entries, blankEntry()]) }

  // Push calculator result into the last focused entry row
  function calcUseDebit(val) {
    const i = lastFocused.index < form.entries.length ? lastFocused.index : form.entries.length - 1
    const entries = [...form.entries]
    entries[i] = { ...entries[i], debit: String(val), credit: '' }
    setF('entries', entries)
  }
  function calcUseCredit(val) {
    const i = lastFocused.index < form.entries.length ? lastFocused.index : form.entries.length - 1
    const entries = [...form.entries]
    entries[i] = { ...entries[i], credit: String(val), debit: '' }
    setF('entries', entries)
  }

  function applyTemplate(tpl) {
    setForm(f => ({
      ...f,
      type: tpl.type || f.type,
      memo: tpl.memo || f.memo,
      entries: (tpl.entries || []).map(e => ({ ...e, id: crypto.randomUUID() })),
    }))
    setShowTemplates(false)
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return
    await onSaveTemplate({
      name: templateName.trim(),
      type: form.type,
      memo: form.memo,
      entries: form.entries.map(({ id, ...e }) => e),
    })
    setTemplateName('')
    setSavingTemplate(false)
  }

  const { debit, credit, balanced } = voucherTotals(form.entries)

  // Only show template features for adjustment type
  const isAdjustment = form.type === 'adjustment'
  const adjustmentTemplates = templates.filter(t => t.type === 'adjustment')
  const isSales = form.type === 'sales'

  // Drop the computed tax lines into the entries table. If the form still has
  // only the default two blank rows, replace them outright; otherwise append.
  function addTaxLines(lines) {
    const hasContent = form.entries.some(e => e.account || e.debit || e.credit)
    const base = hasContent ? form.entries : []
    setF('entries', [...base, ...lines.map(l => ({ ...l, id: crypto.randomUUID() }))])
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: showCalc ? 980 : 620 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <span className="modal-title">{voucher ? 'Edit Voucher' : 'New Voucher'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="icon-btn"
              onClick={() => setShowCalc(v => !v)}
              title={showCalc ? 'Hide calculator' : 'Show calculator'}
              style={showCalc ? { color: 'var(--accent)', background: 'var(--accent-glow)' } : undefined}
            >
              <Calculator size={17} />
            </button>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Two-column: form left, calculator right (calculator toggles via header button) */}
        <div className="voucher-two-col">
          <div style={{ flex: 1, minWidth: 0 }}>

        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Voucher Type</label>
            <select className="form-select" value={form.type} onChange={e => setF('type', e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.date} onChange={e => setF('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Reference No.</label>
            <input className="form-input" value={form.reference} onChange={e => setF('reference', e.target.value)} placeholder="e.g. OR-001" />
          </div>
          <div className="form-group">
            <label className="form-label">Client (optional)</label>
            <select className="form-select" value={form.clientId} onChange={e => setF('clientId', e.target.value)}>
              <option value="">— None —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Memo</label>
            <MemoAutocomplete
              value={form.memo}
              onChange={v => setF('memo', v)}
              recentMemos={recentMemos}
              placeholder="Brief description of this entry"
            />
          </div>
        </div>

        {accounts.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
            Tip: set up your Chart of Accounts first so account names autocomplete here.
          </div>
        )}

        {/* Recurring templates — only shown for Adjustment vouchers */}
        {isAdjustment && (
          <div style={{
            marginBottom: 12, border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', overflow: 'hidden',
          }}>
            <div
              onClick={() => setShowTemplates(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'var(--surface2)',
                cursor: 'pointer', userSelect: 'none', fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <BookMarked size={13} color="var(--accent)" />
                Recurring Templates
                {adjustmentTemplates.length > 0 && (
                  <span style={{
                    background: 'var(--accent)', color: '#fff',
                    borderRadius: 99, fontSize: 10, padding: '1px 6px', fontWeight: 700,
                  }}>
                    {adjustmentTemplates.length}
                  </span>
                )}
              </div>
              <ChevronDown size={13} color="var(--text-3)"
                style={{ transform: showTemplates ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
              />
            </div>

            {showTemplates && (
              <div style={{ padding: '10px 12px' }}>
                {adjustmentTemplates.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                    No saved templates yet. Fill in the entries below and save as a template.
                  </div>
                ) : (
                  <div style={{ marginBottom: 10 }}>
                    {adjustmentTemplates.map(tpl => (
                      <div key={tpl.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', marginBottom: 6,
                        background: 'var(--bg)',
                      }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{tpl.name}</div>
                          {tpl.memo && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{tpl.memo}</div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {(tpl.entries || []).length} line{(tpl.entries || []).length !== 1 ? 's' : ''}
                            {' · '}
                            {(tpl.entries || []).filter(e => parseFloat(e.debit || 0) > 0).map(e => e.account).filter(Boolean).join(', ')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => applyTemplate(tpl)}
                          >
                            Use
                          </button>
                          <button
                            className="icon-btn"
                            style={{ color: 'var(--red)' }}
                            onClick={() => onDeleteTemplate(tpl.id)}
                            title="Delete template"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Save current entries as template */}
                {savingTemplate ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      className="form-input"
                      style={{ fontSize: 12, padding: '5px 8px', flex: 1 }}
                      placeholder="Template name (e.g. Monthly Depreciation)"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
                      autoFocus
                    />
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
                      disabled={!templateName.trim()}
                      onClick={handleSaveTemplate}>
                      Save
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                      onClick={() => { setSavingTemplate(false); setTemplateName('') }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setSavingTemplate(true)}
                  >
                    <Plus size={12} /> Save current entries as template
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {isSales && (
          <SalesTaxPanel settings={settings} accounts={accounts} onAddLines={addTaxLines} />
        )}

        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ fontSize: 12, minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Account</th>
                <th style={{ width: '34%' }}>Description</th>
                <th style={{ width: '17%', textAlign: 'right' }}>Debit</th>
                <th style={{ width: '17%', textAlign: 'right' }}>Credit</th>
                <th style={{ width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {form.entries.map((e, i) => (
                <EntryRow key={e.id} entry={e}
                  index={i}
                  onChange={upd => setEntry(i, upd)}
                  onRemove={() => removeEntry(i)}
                  onAddBelow={addEntry}
                  isLast={i === form.entries.length - 1}
                  accounts={accounts}
                  onFocus={(idx, side) => setLastFocused({ index: idx, side })}
                />
              ))}
            </tbody>
          </table>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={addEntry} style={{ marginBottom: 12 }}>
          <Plus size={13} /> Add Line
        </button>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          border: `1px solid ${balanced ? 'var(--green)' : 'var(--red)'}40`,
        }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            {balanced
              ? <><CheckCircle size={14} color="var(--green)" /> <span style={{ color: 'var(--green)' }}>Balanced</span></>
              : <><AlertCircle size={14} color="var(--red)" /> <span style={{ color: 'var(--red)' }}>Unbalanced — difference: {fmt(Math.abs(debit - credit))}</span></>
            }
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 12, fontFamily: 'var(--mono)' }}>
            <span>DR: {fmt(debit)}</span>
            <span>CR: {fmt(credit)}</span>
          </div>
        </div>

          </div>{/* end left column */}

          {/* Right column: calculator (shown only when toggled on) */}
          {showCalc && (
            <AccountingCalc
              onUseDebit={calcUseDebit}
              onUseCredit={calcUseCredit}
              taxRate={12}
            />
          )}
        </div>{/* end two-column */}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            disabled={!balanced || form.entries.length === 0 || form.entries.some(e => {
              const v = (e.account || '').trim()
              return v.length > 0 && !accounts.map(a => a.name.trim().toLowerCase()).includes(v.toLowerCase())
            })}
            onClick={() => onSave(form)}>
            {voucher ? 'Save Changes' : 'Post Voucher'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Vouchers() {
  const { vouchers, addVoucher, updateVoucher, deleteVoucher, clients, accounts, templates, addTemplate, deleteTemplate, settings } = useStore()
  const [modal, setModal] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Last 20 unique non-empty memos for autocomplete
  const recentMemos = [...new Set(
    [...vouchers].reverse().map(v => v.memo).filter(Boolean)
  )].slice(0, 20)

  function copyNumber(num) {
    navigator.clipboard.writeText(num).then(() => {
      setCopied(num)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const filtered = vouchers.filter(v => {
    const q = search.toLowerCase()
    const matchSearch = v.number.toLowerCase().includes(q) ||
      (v.memo || '').toLowerCase().includes(q) ||
      (v.reference || '').toLowerCase().includes(q)
    const matchType = typeFilter === 'all' || v.type === typeFilter
    return matchSearch && matchType
  })

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Vouchers</div>
          <div className="page-sub">{vouchers.length} journal entr{vouchers.length !== 1 ? 'ies' : 'y'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost"
            disabled={filtered.length === 0 || exporting}
            onClick={async () => {
              setExporting(true)
              try {
                await exportVouchersToExcel(filtered, clients)
              } finally {
                setExporting(false)
              }
            }}
          >
            <Download size={15} /> {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <Plus size={15} /> New Voucher
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-bar">
          <Search size={14} color="var(--text-3)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vouchers..." />
        </div>
        <select className="form-select" style={{ width: 'auto', fontSize: 12 }}
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <FileText size={36} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No vouchers found</div>
            <button className="btn btn-primary" onClick={() => setModal('new')}>
              <Plus size={14} /> New Voucher
            </button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Number</th>
                <th>Type</th>
                <th>Date</th>
                <th>Debit Account</th>
                <th>Credit Account</th>
                <th>Memo</th>
                <th>Reference</th>
                <th style={{ textAlign: 'right' }}>Debit Total</th>
                <th style={{ textAlign: 'right' }}>Credit Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].reverse().map(v => {
                const { debit, credit } = voucherTotals(v.entries)
                const entries = v.entries || []
                const debitAccounts = entries.filter(e => parseFloat(e.debit || 0) > 0).map(e => e.account).filter(Boolean)
                const creditAccounts = entries.filter(e => parseFloat(e.credit || 0) > 0).map(e => e.account).filter(Boolean)
                const debitLabel = debitAccounts.length > 0 ? debitAccounts.join(', ') : '—'
                const creditLabel = creditAccounts.length > 0 ? creditAccounts.join(', ') : '—'
                const isOpen = expanded.has(v.id)
                return (
                  <Fragment key={v.id}>
                    <tr>
                      <td>
                        <button className="icon-btn" onClick={() => toggleExpand(v.id)} title={isOpen ? 'Hide entries' : 'Show entries'}>
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                      <td className="td-mono" style={{ fontWeight: 600 }}>
                        <span
                          title="Click to copy"
                          onClick={() => copyNumber(v.number)}
                          style={{ cursor: 'pointer', borderBottom: '1px dashed var(--border2)' }}
                        >
                          {copied === v.number ? '✓ copied' : v.number}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-blue">{v.type}</span>
                      </td>
                      <td className="td-mono">{v.date || fmtDate(v.createdAt)}</td>
                      <td style={{ fontSize: 12, maxWidth: 160 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={debitLabel}>
                          {debitLabel}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 160 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={creditLabel}>
                          {creditLabel}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-2)', fontSize: 12, maxWidth: 180 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.memo || '—'}
                        </div>
                      </td>
                      <td className="td-mono">{v.reference || '—'}</td>
                      <td className="td-mono" style={{ textAlign: 'right' }}>{fmt(debit, settings.currency)}</td>
                      <td className="td-mono" style={{ textAlign: 'right' }}>{fmt(credit, settings.currency)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" onClick={() => setModal(v)}><Pencil size={14} /></button>
                          <button className="icon-btn" onClick={() => deleteVoucher(v.id)} style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && entries.map((e, i) => (
                      <tr key={`${v.id}-${i}`} style={{ background: 'var(--surface2)' }}>
                        <td></td>
                        <td colSpan={3}></td>
                        <td colSpan={2} style={{ fontSize: 12, paddingLeft: 12 }}>
                          <span style={{ color: 'var(--text-1)' }}>{e.account || '—'}</span>
                          {e.description && (
                            <span style={{ color: 'var(--text-3)' }}> — {e.description}</span>
                          )}
                        </td>
                        <td colSpan={2}></td>
                        <td className="td-mono" style={{ textAlign: 'right', fontSize: 12 }}>
                          {parseFloat(e.debit || 0) > 0 ? fmt(parseFloat(e.debit), settings.currency) : '—'}
                        </td>
                        <td className="td-mono" style={{ textAlign: 'right', fontSize: 12 }}>
                          {parseFloat(e.credit || 0) > 0 ? fmt(parseFloat(e.credit), settings.currency) : '—'}
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <VoucherModal
          voucher={modal === 'new' ? null : modal}
          clients={clients}
          accounts={accounts}
          templates={templates}
          settings={settings}
          recentMemos={recentMemos}
          onSaveTemplate={addTemplate}
          onDeleteTemplate={deleteTemplate}
          onClose={() => setModal(null)}
          onSave={form => {
            if (modal === 'new') addVoucher(form)
            else updateVoucher(modal.id, form)
            setModal(null)
          }}
        />
      )}
    </div>
  )
}
