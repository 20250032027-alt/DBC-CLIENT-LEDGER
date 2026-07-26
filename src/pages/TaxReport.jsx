import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate, postedOnly } from '../utils'
import { FileBarChart, Download, X } from 'lucide-react'

const EXEMPT_SALES_ACCOUNT = 'Sales Revenue - Exempt'

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
//   - "exempt sales": whatever was credited to the "Sales Revenue - Exempt"
//     account in that voucher. A voucher posting only to the exempt account
//     (no VAT Payable line) still gets pulled into the report this way —
//     it just carries a tax amount of 0.
function accountActivity(vouchers, accountName, accountTypeByName = {}) {
  let debit = 0, credit = 0
  const contributingVouchers = []
  vouchers.forEach(v => {
    let voucherAmount = 0
    let vatableAmount = 0
    let exemptAmount = 0
    ;(v.entries || []).forEach(e => {
      const acctName = (e.account || '').trim().toLowerCase()
      const d = parseFloat(e.debit || 0)
      const c = parseFloat(e.credit || 0)
      if (acctName === accountName.toLowerCase()) {
        debit += d
        credit += c
        voucherAmount += c - d
      }
      if (acctName === EXEMPT_SALES_ACCOUNT.toLowerCase()) {
        exemptAmount += c - d
      } else if (accountTypeByName[acctName] === 'revenue') {
        vatableAmount += c - d
      }
    })
    if (Math.abs(voucherAmount) > 0.005 || Math.abs(exemptAmount) > 0.005) {
      contributingVouchers.push({
        ...v,
        taxAmount: voucherAmount,
        vatableAmount,
        exemptAmount,
        payee: v.payee || '',
        payeeTin: v.payeeTin || '',
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

async function exportTaxReportToExcel({ scheme, rate, taxAccountName, from, to, grossSales, exemptSales, taxActivity }) {
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
    ['Exempt Sales (period)', exemptSales],
    [`Tax Due (${taxAccountName})`, taxActivity.net],
    [],
    ['SUPPORTING TRANSACTIONS'],
    ['Date', 'Voucher #', 'Payee', 'TIN', 'Address', 'Nature of Payment', 'Vatable Transaction', 'Exempt Sales', 'Tax Amount'],
    ...taxActivity.contributingVouchers.map(v => [
      fmtDate(v.date || v.createdAt), v.number, v.payee || '', v.payeeTin || '', v.payeeAddress || '',
      v.memo || '', v.vatableAmount, v.exemptAmount, v.taxAmount,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 16 }]
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
  const exemptSales = useMemo(() => accountTotal(periodVouchers, EXEMPT_SALES_ACCOUNT), [periodVouchers])

  const hasData = taxActivity.contributingVouchers.length > 0 || grossSales !== 0 || exemptSales !== 0

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
              await exportTaxReportToExcel({ scheme, rate, taxAccountName, from, to, grossSales, exemptSales, taxActivity })
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
        VAT-exempt or zero-rated sales posted to the "{EXEMPT_SALES_ACCOUNT}" account show up here too, with no tax amount.
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
            <div className="stat-card">
              <span className="stat-label">Exempt Sales</span>
              <div className="stat-value" style={{ fontSize: 22 }}>{fmt(exemptSales, cur)}</div>
            </div>
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
                    <th style={{ textAlign: 'right' }}>Exempt Sales</th>
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
                        <td className="td-mono" style={{ textAlign: 'right' }}>{v.exemptAmount ? fmt(v.exemptAmount, cur) : '—'}</td>
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
