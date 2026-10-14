import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt } from '../utils'
import { showToast } from '../lib/toast'
import { Lock, CalendarCheck, TrendingUp, TrendingDown, ShieldCheck, RotateCcw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'

// Today's date in the user's own timezone. toISOString() alone would give
// the UTC date — in the Philippines that's still "yesterday" until 8 AM.
function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ClosingBooks() {
  const { accounts, periodClosings, closeBooks, reopenPeriod, computePeriodNetActivity, nextPeriodStart, latestOpenClosingId, settings } = useStore()
  const [closedThrough, setClosedThrough] = useState(localToday)
  const [retainedEarningsAccount, setRetainedEarningsAccount] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const currency = settings?.currency || 'PHP'

  const equityAccounts = useMemo(() => accounts.filter(a => a.type === 'equity'), [accounts])
  const periodStart = nextPeriodStart()
  const history = [...periodClosings].sort((a, b) => (b.closedThrough || '').localeCompare(a.closedThrough || ''))

  const preview = useMemo(() => {
    if (!previewing) return null
    const balances = computePeriodNetActivity(periodStart, closedThrough)
    const revenue = []
    const expense = []
    let netIncome = 0
    for (const [name, balance] of Object.entries(balances)) {
      if (Math.abs(balance) < 0.01) continue
      const acct = accounts.find(a => a.name === name)
      if (acct?.type === 'revenue') { revenue.push({ name, balance }); netIncome += balance }
      else { expense.push({ name, balance }); netIncome -= balance }
    }
    return { revenue, expense, netIncome }
  }, [previewing, periodStart, closedThrough, computePeriodNetActivity, accounts])

  async function handleClose() {
    // Closing through a future date would lock vouchers that haven't
    // happened yet — today's sales could no longer be recorded.
    if (closedThrough > localToday()) {
      showToast("You can't close a period that hasn't ended yet. Pick today or an earlier date.", 'error')
      return
    }
    if (!retainedEarningsAccount) {
      showToast('Pick which equity account should absorb the net result.', 'error')
      return
    }
    if (!confirm(`Close the books through ${closedThrough}? This posts a closing voucher and locks every voucher in this period from further edits. You can reopen it later if needed.`)) return
    setClosing(true)
    try {
      const { netIncome } = await closeBooks({ closedThrough, retainedEarningsAccount })
      showToast(`Closed — net ${netIncome >= 0 ? 'income' : 'loss'} of ${fmt(Math.abs(netIncome), currency)} posted.`, 'synced')
      setPreviewing(false)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setClosing(false)
    }
  }

  async function handleReopen(id) {
    if (!confirm("Reopen this period? Its closing voucher will be deleted and every voucher inside it becomes editable again. You can close it again afterward.")) return
    try {
      await reopenPeriod(id)
      showToast('Period reopened.', 'synced')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const latestOpenId = latestOpenClosingId()

  return (
    <div className="page-content" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <div className="page-h1">Closing Books</div>
          <div className="page-sub">Formally close a period — zeroes Revenue and Expense into equity and locks everything inside it</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarCheck size={16} /> Close a Period
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.6 }}>
          {periodStart
            ? <>This period picks up right after the last closing, starting <strong>{periodStart}</strong>.</>
            : <>No periods have been closed yet — this will be the first, covering every posted voucher up through the date below.</>}
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Close through</label>
            <input className="form-input" type="date" value={closedThrough} max={localToday()} onChange={e => { setClosedThrough(e.target.value); setPreviewing(false) }} />
          </div>
          <div className="form-group">
            <label className="form-label">Net result goes to</label>
            <select className="form-select" value={retainedEarningsAccount} onChange={e => setRetainedEarningsAccount(e.target.value)}>
              <option value="">Select an equity account...</option>
              {equityAccounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
        </div>
        {equityAccounts.length === 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--amber)', background: 'var(--amber-dim)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginTop: 4 }}>
            <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
            No Equity accounts yet — add one in Chart of Accounts (like "Owner's Equity" or "Retained Earnings") before closing.
          </div>
        )}

        {!previewing ? (
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setPreviewing(true)} disabled={!retainedEarningsAccount}>
            Preview Closing Entry
          </button>
        ) : (
          <div style={{ marginTop: 16 }}>
            {preview.revenue.length === 0 && preview.expense.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No posted revenue or expense activity in this period — nothing to close.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>WILL BE ZEROED OUT</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                  {preview.revenue.map(r => (
                    <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text-2)' }}>{r.name}</span>
                      <span className="td-mono">{fmt(r.balance, currency)}</span>
                    </div>
                  ))}
                  {preview.expense.map(r => (
                    <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text-2)' }}>{r.name}</span>
                      <span className="td-mono">({fmt(r.balance, currency)})</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 14, fontWeight: 700 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {preview.netIncome >= 0 ? <TrendingUp size={15} color="var(--green)" /> : <TrendingDown size={15} color="var(--red)" />}
                    Net {preview.netIncome >= 0 ? 'Income' : 'Loss'}
                  </span>
                  <span style={{ color: preview.netIncome >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(Math.abs(preview.netIncome), currency)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                  Posts to {retainedEarningsAccount} once closed.
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setPreviewing(false)}>Back</button>
              <button
                className="btn btn-primary" onClick={handleClose}
                disabled={closing || (preview.revenue.length === 0 && preview.expense.length === 0)}
              >
                <Lock size={14} /> {closing ? 'Closing...' : 'Close & Lock Period'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Closing History</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No periods closed yet.</div>
        ) : history.map(p => {
          const isExpanded = expandedId === p.id
          return (
            <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                <button className="icon-btn">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                {p.reopened ? <RotateCcw size={14} color="var(--text-3)" /> : <ShieldCheck size={14} color="var(--green)" />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {p.periodStart || 'Beginning'} through {p.closedThrough}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                    Net {p.netIncome >= 0 ? 'income' : 'loss'}: {fmt(Math.abs(p.netIncome), currency)} → {p.retainedEarningsAccount}
                  </div>
                </div>
                <span className={`badge ${p.reopened ? 'badge-gray' : 'badge-green'}`}>{p.reopened ? 'Reopened' : 'Closed'}</span>
              </div>
              {isExpanded && !p.reopened && (
                <div style={{ marginTop: 10, marginLeft: 36 }}>
                  {p.id === latestOpenId ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleReopen(p.id)}>
                      <RotateCcw size={13} /> Reopen This Period
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      Only the most recent closing can be reopened — reopen the later ones first.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
