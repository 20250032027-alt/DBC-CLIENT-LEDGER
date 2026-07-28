import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate, postedOnly, formatTin, normalizeTin } from '../utils'
import { Printer, FileText } from 'lucide-react'

const WT_ACCOUNT_NAME = 'Withholding Tax Payable'

function monthRange(year, month) {
  const from = new Date(year, month, 1).toISOString().slice(0, 10)
  const to = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

function quarterRange(year, q) {
  const startMonth = (q - 1) * 3
  const from = new Date(year, startMonth, 1).toISOString().slice(0, 10)
  const to = new Date(year, startMonth + 3, 0).toISOString().slice(0, 10)
  return { from, to, startMonth }
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
      address: v.payeeAddress || '',
      nature: v.memo || 'Income payment',
      gross,
      rate: gross > 0 ? (taxWithheld / gross) * 100 : 0,
      taxWithheld,
    })
  })
  return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
}

// Groups a payee's rows (already scoped to one quarter) by nature of
// payment, bucketing each into the 1st/2nd/3rd month of the quarter —
// exactly the shape BIR Form 2307 Part III wants.
function groupForm2307(rows, startMonth) {
  const groups = new Map()
  rows.forEach(r => {
    const key = r.nature || 'Income payment'
    if (!groups.has(key)) {
      groups.set(key, { nature: key, months: [0, 0, 0], taxWithheld: 0 })
    }
    const g = groups.get(key)
    let idx = new Date(r.date).getMonth() - startMonth
    if (idx < 0) idx = 0
    if (idx > 2) idx = 2
    g.months[idx] += r.gross
    g.taxWithheld += r.taxWithheld
  })
  return Array.from(groups.values())
}

function printEWTReport({ settings, from, to, rows, totals, cur }) {
  const w = window.open('', '_blank', 'width=900,height=700')
  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Expanded Withholding Tax Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111827; padding: 40px 48px; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
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

function digitBoxes(value, count) {
  const digits = (value || '').replace(/\D/g, '').padEnd(count, ' ').slice(0, count)
  return digits.split('').map(d => `<span class="box">${d.trim()}</span>`).join('')
}

function mmddyyyy(iso) {
  const [y, m, d] = (iso || '').split('-')
  return `${m || ''}${d || ''}${y || ''}`
}

// Official 2307 groups the TIN as three 3-digit boxes (each with its own
// dash) followed by ONE wider box for the branch code — not a uniform run
// of small boxes. digitBoxes() alone doesn't reproduce that grouping.
function tinBoxes(tin) {
  const digits = (tin || '').replace(/\D/g, '')
  const group = (start, len) => digits.slice(start, start + len).padEnd(len, ' ')
    .split('').map(d => `<span class="box">${d.trim()}</span>`).join('')
  const branch = digits.slice(9, 13)
  return `${group(0, 3)}<span class="tin-dash">-</span>${group(3, 3)}<span class="tin-dash">-</span>${group(6, 3)}` +
    `<span class="tin-dash">-</span><span class="box box-wide">${branch}</span>`
}

function printForm2307({ settings, payee, from, to, lines, totals, monthLabels }) {
  const w = window.open('', '_blank', 'width=900,height=750')
  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>BIR Form 2307 - ${payee.name || 'Payee'}</title>
  <style>
    /* Without this, Chrome/most browsers strip background colors (the gray
       Part I/II/III bars and CONFORME bar) from the actual printed output
       or "Save as PDF" by default, unless the person printing manually
       ticks "Background graphics" in the print dialog — which almost no
       one does. This forces those backgrounds to survive printing so the
       output matches the real BIR form regardless of that setting. */
    body { font-family: Arial, sans-serif; font-size: 10.5px; color: #111; padding: 24px 30px; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    .form-top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 4px; }
    .form-top-left { font-size: 9px; line-height: 1.3; }
    .form-top-center { text-align: center; }
    .form-top-center .agency { font-size: 11px; font-weight: 700; line-height: 1.4; }
    table.title-box { width: 100%; border-collapse: collapse; border: 1.5px solid #111; margin: 4px 0; }
    table.title-box td { border-right: 1px solid #111; padding: 6px 8px; vertical-align: middle; }
    table.title-box td:last-child { border-right: none; }
    .title-formno { width: 20%; font-size: 9.5px; line-height: 1.5; }
    .title-formno b { font-size: 20px; }
    .title-cert { width: 55%; text-align: center; font-size: 16px; font-weight: 700; }
    .title-barcode { width: 25%; text-align: center; font-size: 8px; }
    .barcode { height: 24px; background: repeating-linear-gradient(90deg, #111 0 2px, transparent 2px 5px); margin: 0 auto 3px; width: 85%; }
    .instr { font-size: 9px; padding-bottom: 6px; border-bottom: 1.5px solid #111; margin-bottom: 6px; }
    table.frame { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    table.frame td, table.frame th { border: 1px solid #111; padding: 4px 6px; font-size: 10.5px; vertical-align: top; }
    .section-title { background: #ddd; font-weight: 700; text-align: center; padding: 3px; font-size: 10.5px; border: 1px solid #111; }
    .box { display: inline-block; border: 1px solid #111; width: 13px; height: 15px; text-align: center; margin-right: 1px; font-family: monospace; font-size: 10px; }
    .box-wide { width: 38px; }
    .tin-dash { display: inline-block; margin: 0 3px; font-weight: 700; }
    .field-label { font-size: 9px; color: #333; }
    th.money, td.money { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td { font-weight: 700; }
    .declaration { font-size: 9.5px; border: 1px solid #111; padding: 8px; line-height: 1.5; margin-top: 4px; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 26px; padding: 0 20px; }
    .sig-line { border-top: 1px solid #111; width: 260px; text-align: center; font-size: 9.5px; padding-top: 2px; }
    .conforme { text-align: center; background: #ddd; border: 1px solid #111; font-weight: 700; padding: 3px; font-size: 10.5px; margin-top: 10px; }
    @media print { .no-print { display: none; } }
    .no-print { text-align: center; margin: 20px 0; }
    .no-print button { font-size: 13px; font-weight: 600; padding: 8px 20px; border-radius: 6px; border: none; background: #4f72f5; color: #fff; cursor: pointer; }
  </style>
</head>
<body>

  <div class="form-top">
    <div class="form-top-left">
      For BIR<br>Use Only <span style="margin-left:8px;">BCS/<br>Item:</span>
    </div>
    <div class="form-top-center">
      <div class="agency">Republic of the Philippines<br>Department of Finance<br>Bureau of Internal Revenue</div>
    </div>
  </div>

  <table class="title-box">
    <tr>
      <td class="title-formno">BIR Form No.<br><b>2307</b><br>January 2018 (ENCS)</td>
      <td class="title-cert">Certificate of Creditable Tax<br>Withheld at Source</td>
      <td class="title-barcode"><div class="barcode"></div>2307 01/18ENCS</td>
    </tr>
  </table>

  <div class="instr">Fill in all applicable spaces. Mark all appropriate boxes with an "X".</div>

  <table class="frame">
    <tr>
      <td style="width:20%;"><b>1</b> For the Period</td>
      <td>From ${digitBoxes(mmddyyyy(from), 8)} <span class="field-label">(MM/DD/YYYY)</span>
        &nbsp;&nbsp; To ${digitBoxes(mmddyyyy(to), 8)} <span class="field-label">(MM/DD/YYYY)</span></td>
    </tr>
  </table>

  <div class="section-title">Part I &ndash; Payee Information</div>
  <table class="frame">
    <tr>
      <td style="width:30%;"><b>2</b> Taxpayer Identification Number (TIN)</td>
      <td>${tinBoxes(payee.tin)}</td>
    </tr>
    <tr>
      <td colspan="2"><b>3</b> Payee's Name <span class="field-label">(Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)</span><br>
        <div style="padding-top:4px;font-weight:600;">${payee.name || ''}</div></td>
    </tr>
    <tr>
      <td style="width:70%;"><b>4</b> Registered Address<br><div style="padding-top:4px;">${payee.address || ''}</div></td>
      <td><b>4A</b> ZIP Code</td>
    </tr>
    <tr>
      <td colspan="2"><b>5</b> Foreign Address, if applicable<br><div style="padding-top:4px;">${payee.foreignAddress || ''}</div></td>
    </tr>
  </table>

  <div class="section-title">Part II &ndash; Payor Information</div>
  <table class="frame">
    <tr>
      <td style="width:30%;"><b>6</b> Taxpayer Identification Number (TIN)</td>
      <td>${tinBoxes(settings.tin)}</td>
    </tr>
    <tr>
      <td colspan="2"><b>7</b> Payor's Name <span class="field-label">(Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)</span><br>
        <div style="padding-top:4px;font-weight:600;">${settings.company || ''}</div></td>
    </tr>
    <tr>
      <td style="width:70%;"><b>8</b> Registered Address<br><div style="padding-top:4px;">${(settings.address || '').replace(/\n/g, ', ')}</div></td>
      <td><b>8A</b> ZIP Code</td>
    </tr>
  </table>

  <div class="section-title">Part III &ndash; Details of Monthly Income Payments and Taxes Withheld</div>
  <table class="frame">
    <tr>
      <th rowspan="2" style="width:26%;">Income Payments Subject to<br>Expanded Withholding Tax</th>
      <th rowspan="2" style="width:8%;">ATC</th>
      <th colspan="4" style="text-align:center;">Amount of Income Payments</th>
      <th rowspan="2" class="money" style="width:14%;">Tax Withheld<br>for the Quarter</th>
    </tr>
    <tr>
      <th class="money">${monthLabels[0]}</th>
      <th class="money">${monthLabels[1]}</th>
      <th class="money">${monthLabels[2]}</th>
      <th class="money">Total</th>
    </tr>
    ${lines.map(l => `
    <tr>
      <td>${l.nature}</td>
      <td>${l.atc || ''}</td>
      <td class="money">${fmt(l.months[0], settings.currency)}</td>
      <td class="money">${fmt(l.months[1], settings.currency)}</td>
      <td class="money">${fmt(l.months[2], settings.currency)}</td>
      <td class="money">${fmt(l.months[0] + l.months[1] + l.months[2], settings.currency)}</td>
      <td class="money">${fmt(l.taxWithheld, settings.currency)}</td>
    </tr>`).join('')}
    ${lines.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:#666;">No matching withholding entries this quarter.</td></tr>' : ''}
    <tr class="total-row">
      <td colspan="2">Total</td>
      <td class="money">${fmt(totals.month0, settings.currency)}</td>
      <td class="money">${fmt(totals.month1, settings.currency)}</td>
      <td class="money">${fmt(totals.month2, settings.currency)}</td>
      <td class="money">${fmt(totals.gross, settings.currency)}</td>
      <td class="money">${fmt(totals.taxWithheld, settings.currency)}</td>
    </tr>
  </table>

  <div class="section-title">Money Payments Subject to Withholding of Business Tax (Government &amp; Private)</div>
  <table class="frame">
    <tr>
      <th style="width:26%;">&nbsp;</th><th style="width:8%;">ATC</th>
      <th class="money">${monthLabels[0]}</th><th class="money">${monthLabels[1]}</th><th class="money">${monthLabels[2]}</th>
      <th class="money">Total</th><th class="money">Tax Withheld</th>
    </tr>
    <tr><td colspan="7" style="text-align:center;color:#666;">Not tracked by this ledger — fill in by hand if applicable.</td></tr>
    <tr class="total-row"><td colspan="2">Total</td><td class="money"></td><td class="money"></td><td class="money"></td><td class="money"></td><td class="money"></td></tr>
  </table>

  <div class="declaration">
    We declare under the penalties of perjury that this certificate has been made in good faith, verified by us, and to the best of
    our knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended,
    and the regulations issued under authority thereof. Further, we give our consent to the processing of our information as
    contemplated under the Data Privacy Act of 2012 (R.A. No. 10173) for legitimate and lawful purposes.
  </div>

  <div class="sig-row">
    <div class="sig-line">Signature over Printed Name of Payor/<br>Payor's Authorized Representative/Tax Agent</div>
    <div class="sig-line">Date of Issue (MM/DD/YYYY)</div>
  </div>

  <div class="conforme">CONFORME</div>
  <div class="sig-row" style="margin-top:34px;">
    <div class="sig-line">Signature over Printed Name of Payee/<br>Payee's Authorized Representative/Tax Agent</div>
    <div class="sig-line">Date of Issue (MM/DD/YYYY)</div>
  </div>

  <div class="no-print" style="margin-top:24px;"><button onclick="window.print()">Print</button></div>
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
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const hasAccount = accounts.some(a => (a.name || '').trim().toLowerCase() === WT_ACCOUNT_NAME.toLowerCase())

  // --- BIR Form 2307 generator: pick a payee TIN + quarter, and it pulls
  // every withheld amount for that payee in the quarter straight off the
  // ledger, grouped into Form 2307's Part III layout. ---
  const [f2307Tin, setF2307Tin] = useState('')
  const [f2307Year, setF2307Year] = useState(now.getFullYear())
  const [f2307Quarter, setF2307Quarter] = useState(Math.floor(now.getMonth() / 3) + 1)
  const [atcCodes, setAtcCodes] = useState({})

  const q = quarterRange(f2307Year, f2307Quarter)
  const quarterVouchers = useMemo(() => vouchers.filter(v => {
    if (v.date && v.date < q.from) return false
    if (v.date && v.date > q.to) return false
    return true
  }), [vouchers, q.from, q.to])

  const quarterRows = useMemo(() => buildRows(quarterVouchers, accountTypeByName), [quarterVouchers, accountTypeByName])

  const tinDigits = (f2307Tin || '').replace(/\D/g, '')
  const matchedRows = useMemo(() => {
    if (tinDigits.length < 9) return []
    const target = normalizeTin(f2307Tin)
    return quarterRows.filter(r => r.tin === target)
  }, [quarterRows, f2307Tin, tinDigits])

  const form2307Lines = useMemo(
    () => groupForm2307(matchedRows, q.startMonth).map(l => ({ ...l, atc: atcCodes[l.nature] || '' })),
    [matchedRows, q.startMonth, atcCodes]
  )

  const form2307Totals = useMemo(() => form2307Lines.reduce((acc, l) => ({
    month0: acc.month0 + l.months[0],
    month1: acc.month1 + l.months[1],
    month2: acc.month2 + l.months[2],
    gross: acc.gross + l.months[0] + l.months[1] + l.months[2],
    taxWithheld: acc.taxWithheld + l.taxWithheld,
  }), { month0: 0, month1: 0, month2: 0, gross: 0, taxWithheld: 0 }), [form2307Lines])

  const payeeInfo = matchedRows[0] ? { name: matchedRows[0].payee, tin: matchedRows[0].tin, address: matchedRows[0].address } : null
  const monthLabels = [0, 1, 2].map(i => `${monthShort[(q.startMonth + i) % 12]} (${i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'})`)

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

      <div className="card" style={{ marginBottom: 16 }}>
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

      <div className="card">
        <div className="card-title" style={{ marginBottom: 4 }}>Generate BIR Form 2307</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
          Enter a payee's TIN and pick the quarter — it pulls every withholding entry posted for that
          payee and fills out the certificate.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
          <div className="form-group" style={{ minWidth: 200 }}>
            <label className="form-label">Payee TIN</label>
            <input
              className="form-input" value={f2307Tin}
              onChange={e => setF2307Tin(formatTin(e.target.value))}
              onBlur={e => setF2307Tin(normalizeTin(e.target.value))}
              placeholder="000-000-000-00000"
            />
          </div>
          <div className="form-group" style={{ width: 'auto' }}>
            <label className="form-label">Quarter</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4].map(qq => (
                <button
                  key={qq}
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    fontSize: 12, padding: '7px 12px',
                    background: f2307Quarter === qq ? 'var(--accent)' : undefined,
                    color: f2307Quarter === qq ? '#fff' : undefined,
                  }}
                  onClick={() => setF2307Quarter(qq)}
                >
                  Q{qq}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ width: 'auto' }}>
            <label className="form-label">Year</label>
            <select className="form-select" style={{ width: 'auto', fontSize: 12 }} value={f2307Year} onChange={e => setF2307Year(parseInt(e.target.value, 10))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-3)', paddingBottom: 8 }}>{q.from} to {q.to}</span>
        </div>

        {tinDigits.length > 0 && tinDigits.length < 9 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>Keep typing the TIN — need at least 9 digits to match.</div>
        )}

        {tinDigits.length >= 9 && (
          <>
            {!payeeInfo ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '12px 0' }}>
                No withholding entries found for TIN {normalizeTin(f2307Tin)} in Q{f2307Quarter} {f2307Year}.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12.5, marginBottom: 12 }}>
                  <strong>{payeeInfo.name}</strong> · TIN {payeeInfo.tin}
                  {payeeInfo.address && <span style={{ color: 'var(--text-3)' }}> · {payeeInfo.address}</span>}
                </div>

                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border2)' }}>
                        {['Nature of Payment', 'ATC', ...monthLabels, 'Total', 'Tax Withheld'].map((h, i) => (
                          <th key={h} style={{
                            textAlign: i >= 2 ? 'right' : 'left', padding: '8px', fontSize: 11,
                            textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--text-3)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {form2307Lines.map(l => (
                        <tr key={l.nature} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px' }}>{l.nature}</td>
                          <td style={{ padding: '4px 8px' }}>
                            <input
                              className="form-input" style={{ fontSize: 12, padding: '4px 6px', width: 80 }}
                              value={atcCodes[l.nature] || ''}
                              onChange={e => setAtcCodes(a => ({ ...a, [l.nature]: e.target.value.toUpperCase() }))}
                              placeholder="WI160"
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(l.months[0], cur)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(l.months[1], cur)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(l.months[2], cur)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(l.months[0] + l.months[1] + l.months[2], cur)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(l.taxWithheld, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border2)', fontWeight: 700 }}>
                        <td style={{ padding: '8px' }} colSpan={2}>Total</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(form2307Totals.month0, cur)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(form2307Totals.month1, cur)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(form2307Totals.month2, cur)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(form2307Totals.gross, cur)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{fmt(form2307Totals.taxWithheld, cur)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => printForm2307({ settings, payee: payeeInfo, from: q.from, to: q.to, lines: form2307Lines, totals: form2307Totals, monthLabels })}
                >
                  <FileText size={15} /> Generate Form 2307
                </button>
              </>
            )}
          </>
        )}

        <div style={{
          fontSize: 11, color: 'var(--text-3)', background: 'var(--surface2)',
          borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginTop: 16, lineHeight: 1.7,
        }}>
          Income payments and tax withheld are pulled from posted vouchers for this TIN. ATC codes
          aren't tracked in the ledger — fill them in above before generating so they print on the form.
          "Money Payments Subject to Withholding of Business Tax" isn't tracked here and prints blank
          for manual completion. This is a filing-prep aid, not a substitute for BIR's official form.
        </div>
      </div>
    </div>
  )
}
