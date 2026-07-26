import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate, postedOnly, normalizeTin } from '../utils'
import { Printer } from 'lucide-react'

const WT_ACCOUNT_NAME = 'Withholding Tax Payable'

function monthRange(year, month) {
  const from = new Date(year, month, 1).toISOString().slice(0, 10)
  const to = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

// Builds one row per voucher that has a credit posted to the Withholding
// Tax Payable account — the "tax withheld" for that payment. The income
// payment (gross) is taken as whatever was debited to expense accounts in
// the same voucher, since that's the amount the withholding was computed
// against (e.g. Dr Rent Expense 20,000 / Cr Cash 19,000 / Cr Withholding
// Tax Payable 1,000).
function buildRows(vouchers, accountTypeByName) {
  const rows = []
  vouchers.forEach(v => {
    const entries = v.entries || []
    let taxWithheld = 0
    entries.forEach(e => {
      if ((e.account || '').trim().toLowerCase() === WT_ACCOUNT_NAME.toLowerCase()) {
        taxWithheld += parseFloat(e.credit || 0) - parseFloat(e.debit || 0)
      }
    })
    if (taxWithheld <= 0) return

    let gross = 0
    entries.forEach(e => {
      const type = accountTypeByName[(e.account || '').trim().toLowerCase()]
      if (type === 'expense') gross += parseFloat(e.debit || 0) - parseFloat(e.credit || 0)
    })
    if (gross <= 0) gross = taxWithheld // fallback so the row still shows something sensible

    rows.push({
      id: v.id,
      date: v.date,
      number: v.number,
      payee: v.payee || '(unnamed payee)',
      tin: v.payeeTin ? normalizeTin(v.payeeTin) : '—',
      nature: v.memo || '—',
      gross,
      rate: gross > 0 ? (taxWithheld / gross) * 100 : 0,
      taxWithheld,
    })
  })
  return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
}

function printEWTReport({ settings, from, to, rows, totals, cur }) {
  const w = window.open('', '_blank', 'width=900,height=700')
  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Expanded Withholding Tax Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111827; padding: 40px 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .firm-name { font-size: 18px; font-weight: 800; }
    .firm-meta { font-size: 11px; color: #4b5563; text-align: right; line-height: 1.7; }
    .title { text-align: center; font-size: 18px; font-weight: 700; margin: 20px 0 6px; }
    .period { text-align: center; font-size: 12.5px; color: #4b5563; margin-bottom: 22px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #111827; font-size: 11px; text-transform: uppercase; letter-spacing: 0.02em; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
    td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
    tr.total td { font-weight: 700; border-top: 2px solid #111827; border-bottom: none; }
    .disclaimer { font-size: 10.5px; color: #6b7280; background: #f3f4f6; border-radius: 6px; padding: 12px 16px; line-height: 1.7; margin-top: 20px; }
    @media print { .no-print { display: none; } }
    .no-print { text-align: center; margin: 20px 0; }
    .no-print button { font-size: 13px; font-weight: 600; padding: 8px 20px; border-radius: 6px; border: none; background: #4f72f5; color: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <div class="header">
    <div class="firm-name">${settings.company || 'Your Company'}</div>
    <div class="firm-meta">
      ${settings.tin ? `TIN: ${normalizeTin(settings.tin)}<br>` : ''}
      ${(settings.address || '').replace(/\n/g, '<br>')}
    </div>
  </div>

  <div class="title">Expanded Withholding Tax Report</div>
  <div class="period">${from} to ${to}</div>

  <table>
    <tr>
      <th>Date</th><th>Voucher #</th><th>Payee</th><th>TIN</th><th>Nature of Payment</th>
      <th class="r">Income Payment</th><th class="r">Rate</th><th class="r">Tax Withheld</th>
    </tr>
    ${rows.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td><td>${r.number || '—'}</td><td>${r.payee}</td><td>${r.tin}</td><td>${r.nature}</td>
      <td class="r">${fmt(r.gross, cur)}</td><td class="r">${r.rate.toFixed(2)}%</td><td class="r">${fmt(r.taxWithheld, cur)}</td>
    </tr>`).join('')}
    ${rows.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:#6b7280;">No withholding tax posted this period.</td></tr>' : ''}
    <tr class="total">
      <td colspan="5">Total</td>
      <td class="r">${fmt(totals.gross, cur)}</td><td></td><td class="r">${fmt(totals.taxWithheld, cur)}</td>
    </tr>
  </table>

  <div class="disclaimer">
    This is a computed summary from posted vouchers in DBC Client Ledger, meant to help prepare your
    BIR expanded withholding tax filing (e.g. 0619-E / 1601-EQ / 2307) — it is <strong>not</strong> an
    official government form. Income Payment reflects amounts debited to expense accounts in the same
    voucher as the withholding entry; please verify the ATC code and rate for each payee before filing.
  </div>

  <div class="no-print"><button onclick="window.print()">Print</button></div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`)
  w.document.close()
}

export default function EWTReport() {
  const { vouchers: allVouchers, accounts, settings } = useStore()
  const vouchers = postedOnly(allVouchers)
  const cur = settings.currency

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const { from, to } = monthRange(year, month)

  const accountTypeByName = useMemo(() => {
    const map = {}
    accounts.forEach(a => { map[(a.name || '').trim().toLowerCase()] = a.type })
    return map
  }, [accounts])

  const periodVouchers = useMemo(() => vouchers.filter(v => {
    if (v.date && v.date < from) return false
    if (v.date && v.date > to) return false
    return true
  }), [vouchers, from, to])

  const rows = useMemo(() => buildRows(periodVouchers, accountTypeByName), [periodVouchers, accountTypeByName])

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    gross: acc.gross + r.gross,
    taxWithheld: acc.taxWithheld + r.taxWithheld,
  }), { gross: 0, taxWithheld: 0 }), [rows])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const hasAccount = accounts.some(a => (a.name || '').trim().toLowerCase() === WT_ACCOUNT_NAME.toLowerCase())

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">EWT Report</div>
          <div className="page-sub">Expanded withholding tax — filing-prep summary</div>
        </div>
        <button className="btn btn-ghost" onClick={() => printEWTReport({ settings, from, to, rows, totals, cur })}>
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      <div className="financial-date-toolbar" style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 16, padding: '12px 16px',
        background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
      }}>
        <select className="form-select" style={{ width: 'auto', fontSize: 12 }} value={month} onChange={e => setMonth(parseInt(e.target.value, 10))}>
          {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto', fontSize: 12 }} value={year} onChange={e => setYear(parseInt(e.target.value, 10))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{from} to {to}</span>
      </div>

      {!hasAccount && (
        <div style={{
          fontSize: 12.5, color: 'var(--amber)', background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          padding: '10px 14px', marginBottom: 16, lineHeight: 1.6,
        }}>
          No "{WT_ACCOUNT_NAME}" account found yet — add it in Chart of Accounts (liability) and post
          the withholding portion of a payment to it, and it'll show up here automatically.
        </div>
      )}

      <div className="card">
        <div className="card-title" style={{ marginBottom: 4 }}>Expanded Withholding Tax Summary</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
          {settings.company} {settings.tin ? `· TIN ${normalizeTin(settings.tin)}` : ''}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border2)' }}>
                {['Date', 'Voucher #', 'Payee', 'TIN', 'Nature of Payment', 'Income Payment', 'Rate', 'Tax Withheld'].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i >= 5 ? 'right' : 'left', padding: '8px', fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--text-3)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-3)' }}>
                  No withholding tax posted this period.
                </td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}>{fmtDate(r.date)}</td>
                  <td style={{ padding: '8px' }}>{r.number || '—'}</td>
                  <td style={{ padding: '8px' }}>{r.payee}</td>
                  <td style={{ padding: '8px' }}>{r.tin}</td>
                  <td style={{ padding: '8px' }}>{r.nature}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(r.gross, cur)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.rate.toFixed(2)}%</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(r.taxWithheld, cur)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border2)', fontWeight: 700 }}>
                  <td style={{ padding: '8px' }} colSpan={5}>Total</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(totals.gross, cur)}</td>
                  <td></td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{fmt(totals.taxWithheld, cur)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div style={{
          fontSize: 11, color: 'var(--text-3)', background: 'var(--surface2)',
          borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginTop: 16, lineHeight: 1.7,
        }}>
          Computed from your posted vouchers — this is a prep aid, not an official BIR form (e.g.
          0619-E / 1601-EQ / 2307). Income Payment is the expense debited in the same voucher as the
          withholding entry. Verify ATC codes and rates before filing.
        </div>
      </div>
    </div>
  )
}
