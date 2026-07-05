import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt } from '../utils'
import { BarChart3, X, Download } from 'lucide-react'

async function exportFinancialReportToExcel({
  currentAssets, fixedAssets, currentLiabilities, equity,
  revenue, expenses,
  totalCurrentAssets, totalFixedAssets, totalAssets,
  totalLiabilities, totalEquity, netIncome, totalLE,
  totalRevenue, totalExpenses,
  ratios, asOf, incomeFrom, incomeTo, cur,
}) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const MONEY = '#,##0.00;(#,##0.00);"-"'

  function makeSheet(rows) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 36 }, { wch: 18 }]
    // Apply money format to column B (index 1)
    Object.keys(ws).forEach(ref => {
      if (ref[0] === '!' ) return
      const col = XLSX.utils.decode_cell(ref).c
      if (col === 1 && typeof ws[ref].v === 'number') ws[ref].z = MONEY
    })
    return ws
  }

  // Balance Sheet
  const bsRows = [
    ['BALANCE SHEET'],
    ['As of', asOf || 'All dates'],
    [],
    ['ASSETS'],
    ['Current Assets'],
    ...currentAssets.map(r => [`  ${r.name}`, r.amount]),
    ['Total Current Assets', totalCurrentAssets],
    ...(fixedAssets.length ? [
      ['Fixed Assets'],
      ...fixedAssets.map(r => [`  ${r.name}`, r.amount]),
      ['Total Fixed Assets', totalFixedAssets],
    ] : []),
    ['TOTAL ASSETS', totalAssets],
    [],
    ['LIABILITIES & EQUITY'],
    ['Current Liabilities'],
    ...currentLiabilities.map(r => [`  ${r.name}`, r.amount]),
    ['Total Liabilities', totalLiabilities],
    ['Equity'],
    ...equity.map(r => [`  ${r.name}`, r.amount]),
    ['Total Equity', totalEquity],
    ['Net Income (period)', netIncome],
    ['TOTAL L + E', totalLE],
    [],
    [Math.abs(totalAssets - totalLE) < 0.01 ? '✓ Balance sheet balances' : `⚠ Out of balance by ${Math.abs(totalAssets - totalLE).toFixed(2)}`],
  ]

  // Income Statement
  const isRows = [
    ['INCOME STATEMENT'],
    ['Period', incomeFrom || incomeTo ? `${incomeFrom || '…'} → ${incomeTo || '…'}` : 'All dates'],
    [],
    ['REVENUE'],
    ...revenue.map(r => [`  ${r.name}`, r.amount]),
    ['Total Revenue', totalRevenue],
    [],
    ['EXPENSES'],
    ...expenses.map(r => [`  ${r.name}`, r.amount]),
    ['Total Expenses', totalExpenses],
    [],
    ['NET INCOME', netIncome],
    [],
    ['KEY RATIOS'],
    ...ratios.map(r => [r.label, r.value]),
  ]

  XLSX.utils.book_append_sheet(wb, makeSheet(bsRows), 'Balance Sheet')
  XLSX.utils.book_append_sheet(wb, makeSheet(isRows), 'Income Statement')

  const dateStr = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `dbc-client-ledger-financial-report-${dateStr}.xlsx`)
}

function coaTypeToSection(account) {
  const type = account.type
  if (type === 'asset') {
    const n = account.name.toLowerCase()
    if (n.includes('equipment') || n.includes('furniture') || n.includes('vehicle')
      || n.includes('building') || n.includes('land') || n.includes('property')) return 'fixed-asset'
    const code = parseInt(account.code || '0', 10)
    if (code >= 1500 && code < 2000) return 'fixed-asset'
    return 'current-asset'
  }
  if (type === 'liability') return 'current-liability'
  if (type === 'equity') return 'equity'
  if (type === 'revenue') return 'revenue'
  if (type === 'expense') return 'expense'
  return null
}

function normalBalance(type) {
  return (type === 'asset' || type === 'expense') ? 1 : -1
}

function buildLedger(vouchers) {
  const map = {}
  vouchers.forEach(v => {
    ;(v.entries || []).forEach(e => {
      if (!e.account) return
      const key = e.account.trim().toLowerCase()
      if (!map[key]) map[key] = { debit: 0, credit: 0 }
      map[key].debit += parseFloat(e.debit || 0)
      map[key].credit += parseFloat(e.credit || 0)
    })
  })
  return map
}

function buildSections(ledger, accounts, vouchers) {
  const currentAssets = [], fixedAssets = [], currentLiabilities = [], equity = [], revenue = [], expenses = []

  accounts.forEach(account => {
    const section = coaTypeToSection(account)
    if (!section) return
    const key = account.name.trim().toLowerCase()
    const t = ledger[key] || { debit: 0, credit: 0 }
    if (t.debit === 0 && t.credit === 0) return
    const amount = (t.debit - t.credit) * normalBalance(account.type)
    const row = { name: account.name, amount }
    if (section === 'current-asset') currentAssets.push(row)
    else if (section === 'fixed-asset') fixedAssets.push(row)
    else if (section === 'current-liability') currentLiabilities.push(row)
    else if (section === 'equity') equity.push(row)
    else if (section === 'revenue') revenue.push(row)
    else if (section === 'expense') expenses.push(row)
  })

  // Orphan accounts
  const accountedFor = new Set(accounts.map(a => a.name.trim().toLowerCase()))
  Object.keys(ledger).forEach(key => {
    if (accountedFor.has(key)) return
    const originalName = (() => {
      for (const v of vouchers) {
        for (const e of (v.entries || [])) {
          if (e.account && e.account.trim().toLowerCase() === key) return e.account.trim()
        }
      }
      return key
    })()
    const t = ledger[key]
    const n = key
    if (n.includes('cash') || n.includes('bank') || n.includes('receivable') || n.includes('prepaid') || n.includes('inventory'))
      currentAssets.push({ name: originalName + ' ⚠', amount: t.debit - t.credit })
    else if (n.includes('equipment') || n.includes('furniture') || n.includes('vehicle') || n.includes('building'))
      fixedAssets.push({ name: originalName + ' ⚠', amount: t.debit - t.credit })
    else if (n.includes('payable') || n.includes('unearned') || n.includes('tax'))
      currentLiabilities.push({ name: originalName + ' ⚠', amount: t.credit - t.debit })
    else if (n.includes('capital') || n.includes('retained') || n.includes('equity'))
      equity.push({ name: originalName + ' ⚠', amount: t.credit - t.debit })
    else if (n.includes('revenue') || n.includes('sales') || n.includes('income'))
      revenue.push({ name: originalName + ' ⚠', amount: t.credit - t.debit })
    else if (n.includes('expense') || n.includes('cost') || n.includes('salaries') || n.includes('rent') || n.includes('utilities') || n.includes('supplies'))
      expenses.push({ name: originalName + ' ⚠', amount: t.debit - t.credit })
    else
      currentAssets.push({ name: originalName + ' ⚠ (unclassified)', amount: t.debit - t.credit })
  })

  return { currentAssets, fixedAssets, currentLiabilities, equity, revenue, expenses }
}

function Section({ title, rows, total, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '1px',
        textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8,
      }}>{title}</div>
      {rows.map(r => (
        <div key={r.name} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-2)' }}>{r.name}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(r.amount)}</span>
        </div>
      ))}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '8px 0', fontSize: 13, fontWeight: 700,
        borderTop: '2px solid var(--border2)', marginTop: 4,
      }}>
        <span>Total {title}</span>
        <span style={{ fontFamily: 'var(--mono)', color }}>{fmt(total)}</span>
      </div>
    </div>
  )
}

function DateLabel({ label, value }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
      {label}: <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

export default function FinancialCondition() {
  const { vouchers, bills, accounts, settings } = useStore()
  const cur = settings.currency

  // Balance Sheet: "as of" date — include all vouchers up to and including this date
  const [asOf, setAsOf] = useState('')
  // Income Statement: date range
  const [incomeFrom, setIncomeFrom] = useState('')
  const [incomeTo, setIncomeTo] = useState('')

  // Filter vouchers for Balance Sheet (all vouchers up to asOf date)
  const bsVouchers = useMemo(() => {
    if (!asOf) return vouchers
    return vouchers.filter(v => !v.date || v.date <= asOf)
  }, [vouchers, asOf])

  // Filter vouchers for Income Statement (only within date range)
  const isVouchers = useMemo(() => {
    return vouchers.filter(v => {
      if (incomeFrom && v.date && v.date < incomeFrom) return false
      if (incomeTo && v.date && v.date > incomeTo) return false
      return true
    })
  }, [vouchers, incomeFrom, incomeTo])

  // Filter bills for Balance Sheet (up to asOf)
  const bsBills = useMemo(() => {
    if (!asOf) return bills
    return bills.filter(b => !b.date || b.date <= asOf)
  }, [bills, asOf])

  // Filter bills for Income Statement (date range)
  const isBills = useMemo(() => {
    return bills.filter(b => {
      if (incomeFrom && b.date && b.date < incomeFrom) return false
      if (incomeTo && b.date && b.date > incomeTo) return false
      return true
    })
  }, [bills, incomeFrom, incomeTo])

  // Build Balance Sheet ledger
  const bsLedger = useMemo(() => buildLedger(bsVouchers), [bsVouchers])
  const bsSections = useMemo(() => buildSections(bsLedger, accounts, bsVouchers), [bsLedger, accounts, bsVouchers])

  // Build Income Statement ledger
  const isLedger = useMemo(() => buildLedger(isVouchers), [isVouchers])
  const isSections = useMemo(() => buildSections(isLedger, accounts, isVouchers), [isLedger, accounts, isVouchers])

  // Balance Sheet figures
  const { currentAssets, fixedAssets, currentLiabilities, equity, revenue: bsRevenueRows, expenses: bsExpenseRows } = bsSections

  // Accrual basis: revenue is recognized when an invoice is issued, not when
  // it's paid — payment just moves the asset from Accounts Receivable to
  // Cash. So both paid and unpaid invoices count as revenue; only the asset
  // side (Cash vs A/R) depends on payment status. Without this, any unpaid
  // invoice inflates Assets with nothing on the other side of the equation.
  // Newer bills auto-post a real voucher (tagged with reference = bill
  // number) on creation and on being marked paid, so they already flow
  // through the ledger above via their own Accounts Receivable / Revenue /
  // Cash accounts. Only bills predating that feature — with no matching
  // voucher — need this fallback, or every such invoice gets counted twice.
  const billHasVoucher = b => vouchers.some(v => v.reference === b.number)
  const legacyBsBills = bsBills.filter(b => !billHasVoucher(b))

  const paidBillsBS = legacyBsBills.filter(b => b.status === 'paid').reduce((s, b) => s + parseFloat(b.total || 0), 0)
  const unpaidBillsBS = legacyBsBills.filter(b => b.status !== 'paid').reduce((s, b) => s + parseFloat(b.total || 0), 0)
  if (paidBillsBS > 0) currentAssets.push({ name: 'Cash from Collections', amount: paidBillsBS })
  if (unpaidBillsBS > 0) currentAssets.push({ name: 'Accounts Receivable (Invoices)', amount: unpaidBillsBS })

  const allBillsBS = paidBillsBS + unpaidBillsBS
  if (allBillsBS > 0) {
    const existingBS = bsRevenueRows.find(r => r.name === 'Service Revenue')
    if (existingBS) existingBS.amount += allBillsBS
    else bsRevenueRows.push({ name: 'Billing Revenue (Invoiced)', amount: allBillsBS })
  }

  const totalCurrentAssets = currentAssets.reduce((s, r) => s + r.amount, 0)
  const totalFixedAssets = fixedAssets.reduce((s, r) => s + r.amount, 0)
  const totalAssets = totalCurrentAssets + totalFixedAssets
  const totalLiabilities = currentLiabilities.reduce((s, r) => s + r.amount, 0)
  const totalEquity = equity.reduce((s, r) => s + r.amount, 0)

  // Cumulative net income up to the Balance Sheet's own "as of" date. This
  // intentionally does NOT reuse the Income Statement's net income below —
  // that panel has its own independent date range, and reusing it here would
  // make the "out of balance" check fire falsely whenever the two date
  // filters don't happen to cover the same period.
  const bsTotalRevenue = bsRevenueRows.reduce((s, r) => s + r.amount, 0)
  const bsTotalExpenses = bsExpenseRows.reduce((s, r) => s + r.amount, 0)
  const cumulativeNetIncome = bsTotalRevenue - bsTotalExpenses
  const totalLE = totalLiabilities + totalEquity + cumulativeNetIncome

  // Income Statement figures — its own date range, for display only
  const { revenue, expenses } = isSections

  const legacyIsBills = isBills.filter(b => !billHasVoucher(b))
  const paidBillsIS = legacyIsBills.filter(b => b.status === 'paid').reduce((s, b) => s + parseFloat(b.total || 0), 0)
  const unpaidBillsIS = legacyIsBills.filter(b => b.status !== 'paid').reduce((s, b) => s + parseFloat(b.total || 0), 0)
  const allBillsIS = paidBillsIS + unpaidBillsIS
  if (allBillsIS > 0) {
    const existing = revenue.find(r => r.name === 'Service Revenue')
    if (existing) existing.amount += allBillsIS
    else revenue.push({ name: 'Billing Revenue (Invoiced)', amount: allBillsIS })
  }

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0)
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0)
  const netIncome = totalRevenue - totalExpenses

  const hasData = vouchers.length > 0 || bills.length > 0
  const hasOrphans = [...currentAssets, ...fixedAssets, ...currentLiabilities, ...equity, ...revenue, ...expenses, ...bsRevenueRows, ...bsExpenseRows]
    .some(r => r.name.includes('⚠'))

  const hasDateFilters = asOf || incomeFrom || incomeTo
  const [exporting, setExporting] = useState(false)

  const ratios = [
    { label: 'Current Ratio', value: totalLiabilities > 0 ? (totalCurrentAssets / totalLiabilities).toFixed(2) : 'N/A', note: 'Current Assets / Current Liabilities' },
    { label: 'Gross Margin', value: totalRevenue > 0 ? `${((netIncome / totalRevenue) * 100).toFixed(1)}%` : 'N/A', note: 'Net Income / Revenue' },
    { label: 'Debt to Equity', value: totalEquity > 0 ? (totalLiabilities / totalEquity).toFixed(2) : 'N/A', note: 'Total Liabilities / Total Equity' },
  ]

  function clearDates() { setAsOf(''); setIncomeFrom(''); setIncomeTo('') }

  const labelStyle = { fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }
  const inputStyle = { fontSize: 12, padding: '5px 8px', width: 140 }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Financial Condition & Operations</div>
          <div className="page-sub">Balance Sheet · Income Statement</div>
        </div>
        <button
          className="btn btn-ghost"
          disabled={!hasData || exporting}
          onClick={async () => {
            setExporting(true)
            try {
              await exportFinancialReportToExcel({
                currentAssets, fixedAssets, currentLiabilities, equity,
                revenue, expenses,
                totalCurrentAssets, totalFixedAssets, totalAssets,
                totalLiabilities, totalEquity, netIncome, totalLE,
                totalRevenue, totalExpenses,
                ratios, asOf, incomeFrom, incomeTo, cur,
              })
            } finally { setExporting(false) }
          }}
        >
          <Download size={15} /> {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      {/* Date filter toolbar */}
      <div className="financial-date-toolbar" style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 16, padding: '12px 16px',
        background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
      }}>
        {/* Balance Sheet as-of */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...labelStyle, fontWeight: 600, color: 'var(--text-2)' }}>Balance Sheet</span>
          <span style={labelStyle}>as of</span>
          <input
            className="form-input"
            type="date"
            value={asOf}
            onChange={e => setAsOf(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        {/* Income Statement date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...labelStyle, fontWeight: 600, color: 'var(--text-2)' }}>Income Statement</span>
          <span style={labelStyle}>from</span>
          <input
            className="form-input"
            type="date"
            value={incomeFrom}
            onChange={e => setIncomeFrom(e.target.value)}
            style={inputStyle}
          />
          <span style={labelStyle}>to</span>
          <input
            className="form-input"
            type="date"
            value={incomeTo}
            onChange={e => setIncomeTo(e.target.value)}
            style={inputStyle}
          />
        </div>

        {hasDateFilters && (
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={clearDates}>
            <X size={13} /> Clear dates
          </button>
        )}
      </div>

      {!hasData ? (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={36} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No financial data yet</div>
            <div style={{ fontSize: 13 }}>Post vouchers and invoices to generate reports</div>
          </div>
        </div>
      ) : (
        <>
          {hasOrphans && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--amber, #f59e0b)', padding: '10px 16px' }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                <strong>⚠ Some accounts</strong> are used in vouchers but not found in your Chart of Accounts — they are marked with ⚠ and classified by keyword. Add them to your Chart of Accounts and assign their type to remove this warning.
              </div>
            </div>
          )}

          <div className="two-col">
            {/* Balance Sheet */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Balance Sheet</div>
                  <div className="card-sub">Statement of Financial Position</div>
                  {asOf
                    ? <DateLabel label="As of" value={asOf} />
                    : <DateLabel label="As of" value="all dates" />
                  }
                </div>
              </div>
              <Section title="Current Assets" rows={currentAssets} total={totalCurrentAssets} color="var(--green)" />
              {fixedAssets.length > 0 && (
                <Section title="Fixed Assets" rows={fixedAssets} total={totalFixedAssets} color="var(--accent)" />
              )}
              <div style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                fontSize: 14, fontWeight: 800, borderTop: '2px solid var(--border2)', marginBottom: 20,
              }}>
                <span>Total Assets</span>
                <span style={{ fontFamily: 'var(--mono)', color: totalAssets >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totalAssets, cur)}</span>
              </div>

              <Section title="Current Liabilities" rows={currentLiabilities} total={totalLiabilities} color="var(--red)" />
              <Section title="Equity" rows={equity} total={totalEquity} color="var(--accent)" />

              {cumulativeNetIncome !== 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
                }}>
                  <span style={{ color: 'var(--text-2)' }}>Net Income (cumulative)</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: cumulativeNetIncome >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fmt(cumulativeNetIncome)}
                  </span>
                </div>
              )}

              <div style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                fontSize: 14, fontWeight: 800, borderTop: '2px solid var(--border2)',
              }}>
                <span>Total L + E</span>
                <span style={{
                  fontFamily: 'var(--mono)',
                  color: Math.abs(totalAssets - totalLE) < 0.01 ? 'var(--green)' : 'var(--red)',
                }}>
                  {fmt(totalLE, cur)}
                </span>
              </div>
              {Math.abs(totalAssets - totalLE) >= 0.01 && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6, textAlign: 'right' }}>
                  ⚠ Out of balance by {fmt(Math.abs(totalAssets - totalLE), cur)}
                </div>
              )}
            </div>

            {/* Income Statement */}
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div>
                    <div className="card-title">Income Statement</div>
                    <div className="card-sub">Statement of Operations</div>
                    {(incomeFrom || incomeTo)
                      ? <DateLabel label="Period" value={`${incomeFrom || '…'} → ${incomeTo || '…'}`} />
                      : <DateLabel label="Period" value="all dates" />
                    }
                  </div>
                </div>
                <Section title="Revenue" rows={revenue} total={totalRevenue} color="var(--green)" />
                <Section title="Expenses" rows={expenses} total={totalExpenses} color="var(--red)" />
                <div style={{
                  display: 'flex', justifyContent: 'space-between', padding: '12px 0',
                  fontSize: 15, fontWeight: 800,
                }}>
                  <span>Net Income</span>
                  <span style={{
                    fontFamily: 'var(--mono)',
                    color: netIncome >= 0 ? 'var(--green)' : 'var(--red)',
                  }}>{fmt(netIncome, cur)}</span>
                </div>
              </div>

              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Key Ratios</div>
                {ratios.map(r => (
                  <div key={r.label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '10px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{r.note}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15 }}>{r.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
