import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, postedOnly } from '../utils'
import { Printer } from 'lucide-react'

// mode 'credit' sums credit-debit (liability/revenue convention, e.g. VAT
// Payable, Sales Revenue). mode 'debit' sums debit-credit (asset convention,
// e.g. Input VAT — purchases debit this account, increasing the credit
// available against Output Tax).
function accountTotal(vouchers, accountName, mode = 'credit') {
  let total = 0
  vouchers.forEach(v => {
    ;(v.entries || []).forEach(e => {
      if ((e.account || '').trim().toLowerCase() !== accountName.toLowerCase()) return
      const debit = parseFloat(e.debit || 0)
      const credit = parseFloat(e.credit || 0)
      total += mode === 'debit' ? debit - credit : credit - debit
    })
  })
  return total
}

function quarterRange(year, q) {
  const startMonth = (q - 1) * 3
  const from = new Date(year, startMonth, 1).toISOString().slice(0, 10)
  const to = new Date(year, startMonth + 3, 0).toISOString().slice(0, 10)
  return { from, to }
}

function printTaxReturn({ settings, scheme, rate, from, to, grossSales, taxDue, inputTax, netTaxDue, cur }) {
  const w = window.open('', '_blank', 'width=800,height=700')
  const title = scheme === 'vat' ? 'VAT Return Summary' : 'Percentage Tax Return Summary'
  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111827; padding: 48px 56px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .firm-name { font-size: 18px; font-weight: 800; }
    .firm-meta { font-size: 11.5px; color: #4b5563; text-align: right; line-height: 1.7; }
    .title { text-align: center; font-size: 20px; font-weight: 700; margin: 24px 0 6px; }
    .period { text-align: center; font-size: 13px; color: #4b5563; margin-bottom: 28px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    td, th { padding: 8px 10px; border-bottom: 1px solid #d1d5db; font-size: 13px; }
    td.r { text-align: right; font-variant-numeric: tabular-nums; }
    tr.total td { font-weight: 700; border-top: 2px solid #111827; border-bottom: none; }
    .disclaimer { font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 6px; padding: 12px 16px; line-height: 1.7; margin-top: 24px; }
    @media print { .no-print { display: none; } }
    .no-print { text-align: center; margin: 24px 0; }
    .no-print button { font-size: 13px; font-weight: 600; padding: 8px 20px; border-radius: 6px; border: none; background: #4f72f5; color: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <div class="header">
    <div class="firm-name">${settings.company || 'Your Company'}</div>
    <div class="firm-meta">
      ${settings.tin ? `TIN: ${settings.tin}<br>` : ''}
      ${(settings.address || '').replace(/\n/g, '<br>')}
    </div>
  </div>

  <div class="title">${title}</div>
  <div class="period">${from} to ${to}</div>

  <table>
    <tr><td>Registration Type</td><td class="r">${scheme === 'vat' ? 'VAT-Registered' : 'Non-VAT (Percentage Tax)'}</td></tr>
    <tr><td>Tax Rate</td><td class="r">${rate}%</td></tr>
    <tr><td>Gross Sales / Receipts</td><td class="r">${fmt(grossSales, cur)}</td></tr>
    ${scheme === 'vat' ? `
    <tr><td>Output Tax Due</td><td class="r">${fmt(taxDue, cur)}</td></tr>
    <tr><td>Less: Total Input Tax</td><td class="r">${fmt(inputTax, cur)}</td></tr>
    <tr class="total"><td>Net VAT Payable</td><td class="r">${fmt(netTaxDue, cur)}</td></tr>
    ` : `
    <tr class="total"><td>Percentage Tax Due</td><td class="r">${fmt(taxDue, cur)}</td></tr>
    `}
  </table>

  <div class="disclaimer">
    This is a computed summary from posted vouchers in DBC Client Ledger, meant to help prepare your
    BIR filing — it is <strong>not</strong> an official government form.
    ${scheme === 'vat' ? 'Total Input Tax reflects what has been posted to the Input VAT account from purchase vouchers — verify it against your actual creditable purchases.' : ''}
    It also does not include prior-period credits, penalties, surcharges, or interest. Please verify
    all figures against your own records before filing with the BIR.
  </div>

  <div class="no-print"><button onclick="window.print()">Print</button></div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`)
  w.document.close()
}

export default function TaxReturn() {
  const { vouchers: allVouchers, settings } = useStore()
  const vouchers = postedOnly(allVouchers)
  const cur = settings.currency

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1)

  const scheme = settings.taxScheme === 'percentage' ? 'percentage' : 'vat'
  const rate = scheme === 'vat' ? (settings.vatRate ?? 12) : (settings.percentageTaxRate ?? 3)
  const taxAccountName = scheme === 'vat' ? 'VAT Payable' : 'Percentage Tax Payable'

  const { from, to } = quarterRange(year, quarter)

  const periodVouchers = useMemo(() => vouchers.filter(v => {
    if (v.date && v.date < from) return false
    if (v.date && v.date > to) return false
    return true
  }), [vouchers, from, to])

  const grossSales = useMemo(() => accountTotal(periodVouchers, 'Sales Revenue'), [periodVouchers])
  const taxDue = useMemo(() => accountTotal(periodVouchers, taxAccountName), [periodVouchers, taxAccountName])
  // Input tax only applies to VAT-registered filers — percentage tax has no
  // input tax credit concept under BIR rules.
  const inputTax = useMemo(
    () => (scheme === 'vat' ? accountTotal(periodVouchers, 'Input VAT', 'debit') : 0),
    [periodVouchers, scheme]
  )
  const netTaxDue = taxDue - inputTax

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Tax Return</div>
          <div className="page-sub">Quarterly filing-prep summary</div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => printTaxReturn({ settings, scheme, rate, from, to, grossSales, taxDue, inputTax, netTaxDue, cur })}
        >
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      <div className="financial-date-toolbar" style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 16, padding: '12px 16px',
        background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
      }}>
        <select className="form-select" style={{ width: 'auto', fontSize: 12 }} value={year} onChange={e => setYear(parseInt(e.target.value, 10))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4].map(q => (
            <button
              key={q}
              className="btn btn-ghost"
              style={{
                fontSize: 12, padding: '5px 12px',
                background: quarter === q ? 'var(--accent)' : undefined,
                color: quarter === q ? '#fff' : undefined,
              }}
              onClick={() => setQuarter(q)}
            >
              Q{q}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{from} to {to}</span>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>
          {scheme === 'vat' ? 'VAT Return Summary' : 'Percentage Tax Return Summary'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
          {settings.company} {settings.tin ? `· TIN ${settings.tin}` : ''}
        </div>

        <Row label="Registration Type" value={scheme === 'vat' ? 'VAT-Registered' : 'Non-VAT (Percentage Tax)'} />
        <Row label="Tax Rate" value={`${rate}%`} />
        <Row label="Gross Sales / Receipts" value={fmt(grossSales, cur)} mono />
        {scheme === 'vat' ? (
          <>
            <Row label="Output Tax Due" value={fmt(taxDue, cur)} mono />
            <Row label="Total Input Tax" value={fmt(inputTax, cur)} mono />
            <Row label="Net VAT Payable" value={fmt(netTaxDue, cur)} mono bold color="var(--amber)" topBorder />
          </>
        ) : (
          <Row label="Percentage Tax Due" value={fmt(taxDue, cur)} mono bold color="var(--amber)" topBorder />
        )}

        <div style={{
          fontSize: 11, color: 'var(--text-3)', background: 'var(--surface2)',
          borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginTop: 16, lineHeight: 1.7,
        }}>
          Computed from your posted vouchers — this is a prep aid, not an official BIR form.
          {scheme === 'vat' ? ' Total Input Tax reflects amounts posted to the Input VAT account.' : ''} It doesn't
          include prior-period credits, penalties, or interest. Verify before filing.
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono, bold, color, topBorder }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13.5,
      fontWeight: bold ? 700 : 400,
      borderTop: topBorder ? '2px solid var(--border2)' : '1px solid var(--border)',
      marginTop: topBorder ? 6 : 0,
    }}>
      <span style={{ color: bold ? 'var(--text-1)' : 'var(--text-2)' }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--mono)' : undefined, color: color || 'var(--text-1)' }}>{value}</span>
    </div>
  )
}
