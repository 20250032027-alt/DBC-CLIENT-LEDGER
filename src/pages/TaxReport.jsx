import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate, postedOnly } from '../utils'
import { FileBarChart, Download, X } from 'lucide-react'

// Sums debits/credits to a specific account name, across a set of vouchers —
// the same "account activity" approach a Trial Balance uses, just scoped to
// one liability account (VAT Payable or Percentage Tax Payable) so this
// reflects what's actually posted in the books, not just an assumption about
// which voucher types can affect it.
function accountActivity(vouchers, accountName) {
  let debit = 0, credit = 0
  const contributingVouchers = []
  vouchers.forEach(v => {
    let voucherAmount = 0
    ;(v.entries || []).forEach(e => {
      if ((e.account || '').trim().toLowerCase() !== accountName.toLowerCase()) return
      const d = parseFloat(e.debit || 0)
      const c = parseFloat(e.credit || 0)
      debit += d
      credit += c
      voucherAmount += c - d
    })
    if (Math.abs(voucherAmount) > 0.005) {
      contributingVouchers.push({ ...v, taxAmount: voucherAmount })
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

async function exportTaxReportToExcel({ scheme, rate, taxAccountName, from, to, grossSales, taxActivity }) {
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
    [`Tax Due (${taxAccountName})`, taxActivity.net],
    [],
    ['SUPPORTING TRANSACTIONS'],
    ['Date', 'Voucher #', 'Description', 'Tax Amount'],
    ...taxActivity.contributingVouchers.map(v => [
      fmtDate(v.date || v.createdAt), v.number, v.memo || v.payee || '', v.taxAmount,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 16 }]
  Object.keys(ws).forEach(ref => {
    if (ref[0] === '!') return
    if (typeof ws[ref].v === 'number') ws[ref].z = MONEY
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Tax Report')

  const dateStr = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `dbc-client-ledger-tax-report-${dateStr}.xlsx`)
}

export default function TaxReport() {
  const { vouchers: allVouchers, settings } = useStore()
  const vouchers = postedOnly(allVouchers)
  const cur = settings.currency

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)

  const scheme = settings.taxScheme === 'percentage' ? 'percentage' : 'vat'
  const rate = scheme === 'vat' ? (settings.vatRate ?? 12) : (settings.percentageTaxRate ?? 3)
  const taxAccountName = scheme === 'vat' ? 'VAT Payable' : 'Percentage Tax Payable'

  const periodVouchers = useMemo(() => vouchers.filter(v => {
    if (from && v.date && v.date < from) return false
    if (to && v.date && v.date > to) return false
    return true
  }), [vouchers, from, to])

  const taxActivity = useMemo(() => accountActivity(periodVouchers, taxAccountName), [periodVouchers, taxAccountName])
  const grossSales = useMemo(() => accountTotal(periodVouchers, 'Sales Revenue'), [periodVouchers])

  const hasData = taxActivity.contributingVouchers.length > 0 || grossSales !== 0

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
              await exportTaxReportToExcel({ scheme, rate, taxAccountName, from, to, grossSales, taxActivity })
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
        {scheme === 'vat' && ' It doesn\'t track Input VAT/creditable purchases — factor those in separately before filing.'}
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
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher #</th>
                    <th>Description</th>
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
                        <td style={{ fontSize: 13 }}>{v.memo || v.payee || '—'}</td>
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
