import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { useTheme } from '../lib/theme.jsx'
import { fmt, fmtDate, postedOnly } from '../utils'
import { ArrowUpRight, ArrowDownRight, Waves, Download, X } from 'lucide-react'
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontFamily: 'var(--mono)' }}>
          {p.name}: ₱{p.value.toLocaleString()}
        </div>
      ))}
    </div>
  )
}

// A voucher only belongs in a cash flow statement if it actually moves money
// in or out of a cash/bank account — its free-text "type" label (general,
// adjustment, etc.) isn't a reliable signal of that on its own.
function isCashAccount(name = '') {
  const a = name.toLowerCase()
  return a.includes('cash') || a.includes('bank')
}

// Net change to cash/bank accounts caused by this voucher. Positive = cash in.
function cashDelta(entries = []) {
  return entries
    .filter(e => isCashAccount(e.account))
    .reduce((s, e) => s + parseFloat(e.debit || 0) - parseFloat(e.credit || 0), 0)
}

// Classify by what's on the *other* side of the cash movement — the same
// way a real cash flow statement is built from the chart of accounts.
function classify(entries = []) {
  const others = entries.filter(e => !isCashAccount(e.account)).map(e => (e.account || '').toLowerCase())
  if (others.some(n => n.includes('equipment') || n.includes('property') || n.includes('investment'))) return 'investing'
  if (others.some(n => n.includes('capital') || n.includes('loan') || n.includes('notes payable') || n.includes('owner'))) return 'financing'
  return 'operating'
}

// The account(s) on the other side of the cash movement — what the
// transaction was actually *for*, e.g. "Sales Revenue" or "Fuel, Oil & Gas".
function counterAccountLabel(entries = []) {
  const others = [...new Set(entries.filter(e => !isCashAccount(e.account)).map(e => e.account).filter(Boolean))]
  return others.length ? others.join(' + ') : '(unspecified)'
}

function groupByCounterAccount(txns) {
  const map = {}
  txns.forEach(v => {
    const key = counterAccountLabel(v.entries)
    map[key] = (map[key] || 0) + v.delta
  })
  return Object.entries(map)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}

async function exportCashFlowToExcel({ from, to, beginningBalance, operatingIn, operatingOut, investingNet, financingNet, netChange, endingBalance, operating, investing, financing }) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const MONEY = '#,##0.00;(#,##0.00);"-"'

  function makeSheet(rows) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 34 }, { wch: 18 }]
    Object.keys(ws).forEach(ref => {
      if (ref[0] === '!') return
      if (typeof ws[ref].v === 'number') ws[ref].z = MONEY
    })
    return ws
  }

  const period = from || to ? `${from || '…'} → ${to || '…'}` : 'All dates'

  const summaryRows = [
    ['STATEMENT OF CASH FLOWS — SUMMARY'],
    ['Period', period],
    [],
    ['Beginning Cash Balance', beginningBalance],
    [],
    ['Cash from Operating Activities'],
    ['  Cash Receipts', operatingIn],
    ['  Cash Payments', -operatingOut],
    ['Net Cash from Operating Activities', operatingIn - operatingOut],
    [],
    ['Net Cash from Investing Activities', investingNet],
    [],
    ['Net Cash from Financing Activities', financingNet],
    [],
    ['Net Increase (Decrease) in Cash', netChange],
    ['Ending Cash Balance', endingBalance],
  ]

  function detailRows(title, txns, net) {
    return [
      [title.toUpperCase()],
      ...txns.map(v => ['', fmtDate(v.date || v.createdAt), `${v.number} — ${counterAccountLabel(v.entries)}${v.memo ? ' — ' + v.memo : ''}`, v.delta]),
      ['', '', `Net Cash from ${title}`, net],
      [],
    ]
  }

  const detailSheetRows = [
    ['STATEMENT OF CASH FLOWS — DETAIL'],
    ['Period', period],
    [],
    ['', '', 'Beginning Cash Balance', beginningBalance],
    [],
    ...detailRows('Operating Activities', operating, operatingIn - operatingOut),
    ...detailRows('Investing Activities', investing, investingNet),
    ...detailRows('Financing Activities', financing, financingNet),
    ['', '', 'Net Increase (Decrease) in Cash', netChange],
    ['', '', 'Ending Cash Balance', endingBalance],
  ]

  XLSX.utils.book_append_sheet(wb, makeSheet(summaryRows), 'Cash Flow Summary')
  XLSX.utils.book_append_sheet(wb, makeSheet(detailSheetRows), 'Cash Flow Detail')

  const dateStr = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `dbc-client-ledger-cash-flow-${dateStr}.xlsx`)
}

export default function CashFlow() {
  const { vouchers: allVouchers, bills, settings } = useStore()
  const vouchers = postedOnly(allVouchers)
  const cur = settings.currency
  const { theme } = useTheme()
  const gridStroke = theme === 'dark' ? '#2a3347' : '#e2e6ee'
  const tickFill = theme === 'dark' ? '#64748b' : '#5b6478'

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)

  const cashVouchers = vouchers
    .map(v => ({ ...v, delta: cashDelta(v.entries), bucket: classify(v.entries) }))
    .filter(v => Math.abs(v.delta) > 0.005)

  // Newer bills auto-post a real voucher (tagged with reference = bill
  // number) when created and when marked paid, so they already flow through
  // cashVouchers above via the normal ledger. Only bills predating that
  // feature — with no matching voucher — need this legacy fallback, or
  // every such invoice would be counted twice.
  const billHasVoucher = b => vouchers.some(v => v.reference === b.number)
  const legacyPaidBills = bills.filter(b => b.status === 'paid' && !billHasVoucher(b))
  const paidBillsTotal = legacyPaidBills.reduce((s, b) => s + parseFloat(b.total || 0), 0)

  const operating = cashVouchers.filter(v => v.bucket === 'operating')
  const investing = cashVouchers.filter(v => v.bucket === 'investing')
  const financing = cashVouchers.filter(v => v.bucket === 'financing')

  // Operating: cash-moving vouchers classified as operating, plus paid
  // invoices that don't have a real voucher behind them (legacy data).
  const operatingIn = operating.filter(v => v.delta > 0).reduce((s, v) => s + v.delta, 0) + paidBillsTotal
  const operatingOut = operating.filter(v => v.delta < 0).reduce((s, v) => s - v.delta, 0)
  const investingNet = investing.reduce((s, v) => s + v.delta, 0)
  const financingNet = financing.reduce((s, v) => s + v.delta, 0)

  const netCash = operatingIn - operatingOut + investingNet + financingNet

  // ── Formal Statement of Cash Flows (Summary + Detail) for a selectable
  // period — separate from the always-all-time dashboard stats above, since
  // a real report needs to reconcile a beginning balance to an ending one
  // for a specific date range, the way an accountant would actually use it.
  const periodTxns = useMemo(() => cashVouchers.filter(v => {
    if (from && v.date && v.date < from) return false
    if (to && v.date && v.date > to) return false
    return true
  }), [cashVouchers, from, to])

  const beginningBalance = useMemo(() => {
    if (!from) return 0
    return cashVouchers.filter(v => v.date && v.date < from).reduce((s, v) => s + v.delta, 0)
  }, [cashVouchers, from])

  const periodOperating = periodTxns.filter(v => v.bucket === 'operating')
  const periodInvesting = periodTxns.filter(v => v.bucket === 'investing')
  const periodFinancing = periodTxns.filter(v => v.bucket === 'financing')

  const periodOperatingIn = periodOperating.filter(v => v.delta > 0).reduce((s, v) => s + v.delta, 0)
  const periodOperatingOut = periodOperating.filter(v => v.delta < 0).reduce((s, v) => s - v.delta, 0)
  const periodInvestingNet = periodInvesting.reduce((s, v) => s + v.delta, 0)
  const periodFinancingNet = periodFinancing.reduce((s, v) => s + v.delta, 0)
  const periodNetChange = periodOperatingIn - periodOperatingOut + periodInvestingNet + periodFinancingNet
  const endingBalance = beginningBalance + periodNetChange

  const operatingByAccount = useMemo(() => groupByCounterAccount(periodOperating), [periodOperating])
  const investingByAccount = useMemo(() => groupByCounterAccount(periodInvesting), [periodInvesting])
  const financingByAccount = useMemo(() => groupByCounterAccount(periodFinancing), [periodFinancing])

  const hasPeriodData = periodTxns.length > 0

  // Monthly data
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const label = d.toLocaleString('en', { month: 'short' })
    const yr = d.getFullYear(), mo = d.getMonth()

    const monthCash = cashVouchers.filter(v => {
      const vd = new Date(v.createdAt)
      return vd.getMonth() === mo && vd.getFullYear() === yr
    })
    const billsInMonth = legacyPaidBills.filter(b => {
      const bd = new Date(b.createdAt)
      return bd.getMonth() === mo && bd.getFullYear() === yr
    }).reduce((s, b) => s + parseFloat(b.total || 0), 0)

    const inflow = monthCash.filter(v => v.delta > 0).reduce((s, v) => s + v.delta, 0) + billsInMonth
    const outflow = monthCash.filter(v => v.delta < 0).reduce((s, v) => s - v.delta, 0)
    months.push({ label, inflow, outflow, net: inflow - outflow })
  }

  // Recent transactions
  const transactions = [
    ...legacyPaidBills.map(b => ({
      id: b.id, date: b.createdAt, label: `Invoice ${b.number}`,
      amount: parseFloat(b.total || 0), type: 'inflow',
    })),
    ...cashVouchers.map(v => ({
      id: v.id, date: v.date || v.createdAt, label: `${v.number} — ${v.memo || v.type}`,
      amount: Math.abs(v.delta), type: v.delta > 0 ? 'inflow' : 'outflow',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Cash Flow</div>
          <div className="page-sub">Cash position and movement</div>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {[
          { label: 'Operating Inflows', val: operatingIn, color: 'var(--green)', icon: ArrowUpRight },
          { label: 'Operating Outflows', val: operatingOut, color: 'var(--red)', icon: ArrowDownRight },
          {
            label: 'Investing Activities', val: investingNet,
            color: investingNet >= 0 ? 'var(--green)' : 'var(--amber)',
            icon: investingNet >= 0 ? ArrowUpRight : ArrowDownRight,
          },
          {
            label: 'Financing Activities', val: financingNet,
            color: financingNet >= 0 ? 'var(--accent)' : 'var(--red)',
            icon: financingNet >= 0 ? ArrowUpRight : ArrowDownRight,
          },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="stat-label">{s.label}</span>
              <s.icon size={14} color={s.color} />
            </div>
            <div className="stat-value" style={{ fontSize: 20, color: s.color }}>{fmt(s.val, cur)}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 0', borderBottom: '1px solid var(--border)', marginBottom: 16,
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Net Cash Position</div>
          <div style={{
            fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)',
            color: netCash >= 0 ? 'var(--green)' : 'var(--red)',
            letterSpacing: '-1px',
          }}>
            {fmt(netCash, cur)}
          </div>
        </div>

        <div className="card-title" style={{ marginBottom: 12 }}>6-Month Overview</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={months} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickFill }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: tickFill }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
            <Bar dataKey="inflow" name="Inflow" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="outflow" name="Outflow" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Cash Movements</div>
        </div>
        {transactions.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 0' }}>
            <Waves size={24} />
            <span style={{ fontSize: 13 }}>No cash transactions yet</span>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Flow</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id}>
                    <td className="td-mono">{fmtDate(t.date)}</td>
                    <td style={{ fontSize: 13 }}>{t.label}</td>
                    <td>
                      <span className={`badge ${t.type === 'inflow' ? 'badge-green' : 'badge-red'}`}>
                        {t.type === 'inflow' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                        {t.type}
                      </span>
                    </td>
                    <td className="td-mono" style={{
                      textAlign: 'right',
                      color: t.type === 'inflow' ? 'var(--green)' : 'var(--red)',
                    }}>
                      {t.type === 'inflow' ? '+' : '-'}{fmt(t.amount, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Statement of Cash Flows — Summary & Detail ────────────────── */}
      <div className="page-header" style={{ marginTop: 8 }}>
        <div>
          <div className="page-h1" style={{ fontSize: 18 }}>Statement of Cash Flows</div>
          <div className="page-sub">Summary and detailed reports for a specific period</div>
        </div>
        <button
          className="btn btn-ghost"
          disabled={!hasPeriodData || exporting}
          onClick={async () => {
            setExporting(true)
            try {
              await exportCashFlowToExcel({
                from, to, beginningBalance,
                operatingIn: periodOperatingIn, operatingOut: periodOperatingOut,
                investingNet: periodInvestingNet, financingNet: periodFinancingNet,
                netChange: periodNetChange, endingBalance,
                operating: periodOperating, investing: periodInvesting, financing: periodFinancing,
              })
            } finally { setExporting(false) }
          }}
        >
          <Download size={15} /> {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      <div className="financial-date-toolbar" style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 16, padding: '12px 16px',
        background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Period from</span>
          <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', width: 140 }} />
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>to</span>
          <input className="form-input" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', width: 140 }} />
        </div>
        {(from || to) && (
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setFrom(''); setTo('') }}>
            <X size={13} /> Clear dates
          </button>
        )}
        {!from && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Set a "from" date to compute a beginning balance — without one, this covers all-time.
          </span>
        )}
      </div>

      {!hasPeriodData ? (
        <div className="card">
          <div className="empty-state">
            <Waves size={28} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No cash transactions in this period</div>
          </div>
        </div>
      ) : (
        <div className="two-col" style={{ alignItems: 'start' }}>
          {/* Summary */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Summary</div>
            <CFRow label="Beginning Cash Balance" value={beginningBalance} cur={cur} bold />
            <div style={{ height: 10 }} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>Operating Activities</div>
            <CFRow label="Cash Receipts" value={periodOperatingIn} cur={cur} />
            <CFRow label="Cash Payments" value={-periodOperatingOut} cur={cur} />
            <CFRow label="Net Cash from Operating" value={periodOperatingIn - periodOperatingOut} cur={cur} bold topBorder />
            <div style={{ height: 10 }} />
            <CFRow label="Net Cash from Investing" value={periodInvestingNet} cur={cur} bold />
            <div style={{ height: 10 }} />
            <CFRow label="Net Cash from Financing" value={periodFinancingNet} cur={cur} bold />
            <div style={{ height: 14 }} />
            <CFRow label="Net Increase (Decrease) in Cash" value={periodNetChange} cur={cur} bold topBorder color={periodNetChange >= 0 ? 'var(--green)' : 'var(--red)'} />
            <CFRow label="Ending Cash Balance" value={endingBalance} cur={cur} bold color={endingBalance >= 0 ? 'var(--green)' : 'var(--red)'} />
          </div>

          {/* Detail */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Detail</div>
            <CashFlowDetailSection title="Operating Activities" byAccount={operatingByAccount} txns={periodOperating} net={periodOperatingIn - periodOperatingOut} cur={cur} />
            <CashFlowDetailSection title="Investing Activities" byAccount={investingByAccount} txns={periodInvesting} net={periodInvestingNet} cur={cur} />
            <CashFlowDetailSection title="Financing Activities" byAccount={financingByAccount} txns={periodFinancing} net={periodFinancingNet} cur={cur} />
          </div>
        </div>
      )}
    </div>
  )
}

function CFRow({ label, value, cur, bold, topBorder, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13,
      fontWeight: bold ? 700 : 400,
      borderTop: topBorder ? '2px solid var(--border2)' : undefined,
      marginTop: topBorder ? 4 : 0,
    }}>
      <span style={{ color: bold ? 'var(--text-1)' : 'var(--text-2)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', color: color || (bold ? 'var(--text-1)' : 'var(--text-2)') }}>{fmt(value, cur)}</span>
    </div>
  )
}

function CashFlowDetailSection({ title, byAccount, txns, net, cur }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-3)' }}>{title}</span>
        {txns.length > 0 && (
          <button className="btn-ghost" style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Show by account' : `Show all ${txns.length} transactions`}
          </button>
        )}
      </div>

      {txns.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '4px 0 10px' }}>No transactions</div>
      ) : expanded ? (
        <div style={{ marginBottom: 6 }}>
          {txns.map(v => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 12.5, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fmtDate(v.date || v.createdAt)} — {v.number} — {counterAccountLabel(v.entries)}
              </span>
              <span className="td-mono" style={{ flexShrink: 0, color: v.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(v.delta, cur)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 6 }}>
          {byAccount.map(r => (
            <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-2)' }}>{r.name}</span>
              <span className="td-mono" style={{ color: r.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(r.amount, cur)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, fontWeight: 700, borderTop: '2px solid var(--border2)' }}>
        <span>Net Cash from {title}</span>
        <span style={{ fontFamily: 'var(--mono)', color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net, cur)}</span>
      </div>
    </div>
  )
}
