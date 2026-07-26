import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate, postedOnly, normalizeTin } from '../utils'
import { FileBarChart, Download, X } from 'lucide-react'

// Special revenue accounts that are VAT-exempt but still need to show up in
// the Tax Report, broken out separately from regular vatable sales (BIR
// reporting distinguishes exempt sales from senior-citizen/PWD discounted
// sales, even though both carry no output tax). Post a sale to one of these
// instead of the regular Sales Revenue account, and it'll show up here on
// its own line — no per-voucher checkbox needed.
const SPECIAL_SALES_ACCOUNTS = [
  { key: 'exempt', name: 'Sales Revenue - Exempt', label: 'Exempt Sales' },
  { key: 'seniorCitizen', name: 'Sales Revenue - Senior Citizen Discount', label: 'Senior Citizen Discount' },
]

// Sums debits/credits to a specific account name, across a set of vouchers —
// the same "account activity" approach a Trial Balance uses, just scoped to
// one liability account (VAT Payable or Percentage Tax Payable) so this
// reflects what's actually posted in the books, not just an assumption about
// which voucher types can affect it.
//
// Also carries payee/TIN/address off the voucher header and works out:
//   - "vatable transaction": whatever was credited to a taxable revenue
//     account (e.g. Sales Revenue, Service Revenue) in that same voucher —
//     e.g. Dr Cash 11,200 / Cr Sales Revenue 10,000 / Cr VAT Payable 1,200
//     → vatable amount 10,000.
//   - one amount per SPECIAL_SALES_ACCOUNTS entry: whatever was credited to
//     that special account in the voucher. A voucher posting only to a
//     special account (no VAT Payable line) still gets pulled into the
//     report this way — it just carries a tax amount of 0.
function accountActivity(vouchers, accountName, accountTypeByName = {}) {
  let debit = 0, credit = 0
  const contributingVouchers = []
  const specialNames = SPECIAL_SALES_ACCOUNTS.map(s => s.name.toLowerCase())

  vouchers.forEach(v => {
    let voucherAmount = 0
    let vatableAmount = 0
    const special = {}
    SPECIAL_SALES_ACCOUNTS.forEach(s => { special[s.key] = 0 })

    ;(v.entries || []).forEach(e => {
      const acctName = (e.account || '').trim().toLowerCase()
      const d = parseFloat(e.debit || 0)
      const c = parseFloat(e.credit || 0)
      if (acctName === accountName.toLowerCase()) {
        debit += d
        credit += c
        voucherAmount += c - d
      }
      const specialMatch = SPECIAL_SALES_ACCOUNTS.find(s => s.name.toLowerCase() === acctName)
      if (specialMatch) {
        special[specialMatch.key] += c - d
      } else if (accountTypeByName[acctName] === 'revenue') {
        vatableAmount += c - d
      }
    })

    const hasSpecialAmount = Object.values(special).some(amt => Math.abs(amt) > 0.005)
    if (Math.abs(voucherAmount) > 0.005 || hasSpecialAmount) {
      contributingVouchers.push({
        ...v,
        taxAmount: voucherAmount,
        vatableAmount,
        special,
        payee: v.payee || '',
        payeeTin: v.payeeTin ? normalizeTin(v.payeeTin) : '',
        payeeAddress: v.payeeAddress || '',
      })
    }
  })
  return { debit, credit, net: credit - debit, contributingVouchers }
}

function accountTotal(vouchers, accountName) {
  let total = 0
  vouchers.forEach(v => {
    ;(v.entries || []).forEach(e => {
      if ((e.account || '').trim().toLowerCase() !== accountName.toLowerCase()) return
      total += parseFloat(e.credit || 0) - parseFloat(e.debit || 0)
    })
  })
  return total
}

async function exportTaxReportToExcel({ scheme, rate, taxAccountName, from, to, grossSales, specialTotals, taxActivity }) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const MONEY = '#,##0.00;(#,##0.00);"-"'

  const period = from || to ? `${from || '…'} → ${to || '…'}` : 'All dates'
  const rows = [
    [scheme === 'vat' ? 'VAT REPORT' : 'PERCENTAGE TAX REPORT'],
    ['Period', period],
    ['Rate', `${rate}%`],
    [],
    ['Gross Sales (period)', grossSales],
    ...SPECIAL_SALES_ACCOUNTS.map(s => [`${s.label} (period)`, specialTotals[s.key]]),
    [`Tax Due (${taxAccountName})`, taxActivity.net],
    [],
    ['SUPPORTING TRANSACTIONS'],
    ['Date', 'Voucher #', 'Payee', 'TIN', 'Address', 'Nature of Payment', 'Vatable Transaction', ...SPECIAL_SALES_ACCOUNTS.map(s => s.label), 'Tax Amount'],
    ...taxActivity.contributingVouchers.map(v => [
      fmtDate(v.date || v.createdAt), v.number, v.payee || '', v.payeeTin || '', v.payeeAddress || '',
      v.memo || '', v.vatableAmount, ...SPECIAL_SALES_ACCOUNTS.map(s => v.special[s.key]), v.taxAmount,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 28 }, { wch: 18 },
    ...SPECIAL_SALES_ACCOUNTS.map(() => ({ wch: 16 })), { wch: 16 },
  ]
  Object.keys(ws).forEach(ref => {
    if (ref[0] === '!') return
    if (typeof ws[ref].v === 'number') ws[ref].z = MONEY
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Tax Report')

  const dateStr = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `dbc-client-ledger-tax-report-${dateStr}.xlsx`)
}

export default function TaxReport() {
  const { vouchers: allVouchers, accounts, settings } = useStore()
  const vouchers = postedOnly(allVouchers)
  const cur = settings.currency

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)

  const scheme = settings.taxScheme === 'percentage' ? 'percentage' : 'vat'
  const rate = scheme === 'vat' ? (settings.vatRate ?? 12) : (settings.percentageTaxRate ?? 3)
  const taxAccountName = scheme === 'vat' ? 'VAT Payable' : 'Percentage Tax Payable'

  const accountTypeByName = useMemo(() => {
    const map = {}
    accounts.forEach(a => { map[(a.name || '').trim().toLowerCase()] = a.type })
    return map
  }, [accounts])

  const periodVouchers = useMemo(() => vouchers.filter(v => {
    if (from && v.date && v.date < from) return false
    if (to && v.date && v.date > to) return false
    return true
  }), [vouchers, from, to])

  const taxActivity = useMemo(
    () => accountActivity(periodVouchers, taxAccountName, accountTypeByName),
    [periodVouchers, taxAccountName, accountTypeByName]
  )
  const grossSales = useMemo(() => accountTotal(periodVouchers, 'Sales Revenue'), [periodVouchers])
  const specialTotals = useMemo(() => {
    const totals = {}
    SPECIAL_SALES_ACCOUNTS.forEach(s => { totals[s.key] = accountTotal(periodVouchers, s.name) })
    return totals
  }, [periodVouchers])

  const hasData = taxActivity.contributingVouchers.length > 0 || grossSales !== 0
    || Object.values(specialTotals).some(v => v !== 0)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Tax Report</div>
          <div className="page-sub">
            {scheme === 'vat' ? `VAT-registered — ${rate}%` : `Non-VAT / Percentage Tax — ${rate}%`}
          </div>
        </div>
        <button
          className="btn btn-ghost"
          disabled={!hasData || exporting}
          onClick={async () => {
            setExporting(true)
            try {
              await exportTaxReportToExcel({ scheme, rate, taxAccountName, from, to, grossSales, specialTotals, taxActivity })
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
      </div>

      <div style={{
        fontSize: 12, color: 'var(--text-3)', background: 'var(--surface2)',
        borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, lineHeight: 1.6,
      }}>
        This reflects what's posted to your books — {scheme === 'vat' ? 'Output VAT from Sales Revenue only' : 'Percentage Tax from Sales Revenue only'}.
        VAT-exempt sales (regular exempt, or senior citizen discount) posted to their own accounts show up here too, with no tax amount.
        {scheme === 'vat' && ' This report doesn\'t track Input VAT/creditable purchases — factor those in separately before filing.'}
      </div>

      {!hasData ? (
        <div className="card">
          <div className="empty-state">
            <FileBarChart size={28} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No tax activity in this period</div>
            <div style={{ fontSize: 13 }}>Sales vouchers with tax lines will show up here</div>
          </div>
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: 16 }}>
            <div className="stat-card">
              <span className="stat-label">Gross Sales</span>
              <div className="stat-value" style={{ fontSize: 22 }}>{fmt(grossSales, cur)}</div>
            </div>
            {SPECIAL_SALES_ACCOUNTS.map(s => (
              <div className="stat-card" key={s.key}>
                <span className="stat-label">{s.label}</span>
                <div className="stat-value" style={{ fontSize: 22 }}>{fmt(specialTotals[s.key], cur)}</div>
              </div>
            ))}
            <div className="stat-card">
              <span className="stat-label">Tax Rate</span>
              <div className="stat-value" style={{ fontSize: 22 }}>{rate}%</div>
            </div>
            <div className="stat-card">
              <span className="stat-label">Tax Due ({taxAccountName})</span>
              <div className="stat-value" style={{ fontSize: 22, color: 'var(--amber)' }}>{fmt(taxActivity.net, cur)}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Supporting Transactions</div>
            <div className="table-wrap" style={{ border: 'none', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher #</th>
                    <th>Payee</th>
                    <th>TIN</th>
                    <th>Address</th>
                    <th>Nature of Payment</th>
                    <th style={{ textAlign: 'right' }}>{scheme === 'vat' ? 'Vatable Transaction' : 'Taxable Transaction'}</th>
                    {SPECIAL_SALES_ACCOUNTS.map(s => (
                      <th key={s.key} style={{ textAlign: 'right' }}>{s.label}</th>
                    ))}
                    <th style={{ textAlign: 'right' }}>Tax Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {taxActivity.contributingVouchers
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .map(v => (
                      <tr key={v.id}>
                        <td className="td-mono">{fmtDate(v.date || v.createdAt)}</td>
                        <td className="td-mono">{v.number}</td>
                        <td style={{ fontSize: 13 }}>{v.payee || '—'}</td>
                        <td className="td-mono">{v.payeeTin || '—'}</td>
                        <td style={{ fontSize: 13 }}>{v.payeeAddress || '—'}</td>
                        <td style={{ fontSize: 13 }}>{v.memo || '—'}</td>
                        <td className="td-mono" style={{ textAlign: 'right' }}>{fmt(v.vatableAmount, cur)}</td>
                        {SPECIAL_SALES_ACCOUNTS.map(s => (
                          <td key={s.key} className="td-mono" style={{ textAlign: 'right' }}>
                            {v.special[s.key] ? fmt(v.special[s.key], cur) : '—'}
                          </td>
                        ))}
                        <td className="td-mono" style={{ textAlign: 'right' }}>{fmt(v.taxAmount, cur)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
