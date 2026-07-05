import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate } from '../utils'
import { BookOpen, ChevronDown, ChevronUp, Download, Search, X } from 'lucide-react'

function normalSide(type) {
  return (type === 'asset' || type === 'expense') ? 1 : -1
}

async function exportToExcel(accountSections, currency, dateFrom, dateTo) {
  const XLSX = await import('xlsx')
  const MONEY_FMT = '#,##0.00;(#,##0.00);"-"'

  const rows = []

  // Header row showing applied filters
  if (dateFrom || dateTo) {
    rows.push({ Account: `Date range: ${dateFrom || 'start'} to ${dateTo || 'end'}` })
    rows.push({})
  }

  accountSections.forEach(({ account, entries, closingBalance }) => {
    // Account header row
    rows.push({
      Account: account.name,
      Code: account.code || '',
      Type: account.type,
      Date: '',
      'Voucher #': '',
      'Memo / Description': '',
      Debit: '',
      Credit: '',
      Balance: '',
    })

    let running = 0
    entries.forEach(e => {
      running += e.debit - e.credit
      rows.push({
        Account: '',
        Code: '',
        Type: '',
        Date: e.rawDate || e.date,
        'Voucher #': e.voucherNumber,
        'Memo / Description': e.memo || e.description || '',
        Debit: e.debit > 0 ? e.debit : '',
        Credit: e.credit > 0 ? e.credit : '',
        Balance: running,
      })
    })

    // Totals row
    rows.push({
      Account: 'Closing Balance',
      Code: '',
      Type: '',
      Date: '',
      'Voucher #': '',
      'Memo / Description': '',
      Debit: entries.reduce((s, e) => s + e.debit, 0),
      Credit: entries.reduce((s, e) => s + e.credit, 0),
      Balance: closingBalance,
    })
    rows.push({})
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  // Apply money format to Debit, Credit, Balance columns (G=6, H=7, I=8)
  const moneyFmt = '#,##0.00;(#,##0.00);"-"'
  const rowCount = rows.length
  ;[6, 7, 8].forEach(c => {
    for (let r = 1; r <= rowCount; r++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = moneyFmt
    }
  })

  ws['!cols'] = [
    { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 34 }, { wch: 13 }, { wch: 13 }, { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Account Listing')
  const dateStr = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `dbc-client-ledger-account-listing-${dateStr}.xlsx`)
}

function AccountSection({ account, entries, closingBalance, currency }) {
  const [open, setOpen] = useState(true)

  let running = 0
  const rows = entries.map(e => {
    running += e.debit - e.credit
    return { ...e, running }
  })

  const nb = normalSide(account.type)
  const displayBalance = closingBalance * nb

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {open ? <ChevronUp size={15} color="var(--text-3)" /> : <ChevronDown size={15} color="var(--text-3)" />}
          <div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{account.name}</span>
            {account.code && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                {account.code}
              </span>
            )}
            <span style={{
              marginLeft: 8, fontSize: 11, textTransform: 'uppercase',
              color: 'var(--text-3)', letterSpacing: '0.5px',
            }}>
              {account.type}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14,
            color: displayBalance < 0 ? 'var(--red)' : 'var(--text-1)',
          }}>
            {fmt(Math.abs(displayBalance), currency)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {displayBalance >= 0
              ? (account.type === 'asset' || account.type === 'expense' ? 'DR balance' : 'CR balance')
              : (account.type === 'asset' || account.type === 'expense' ? 'CR balance' : 'DR balance')
            }
            {' · '}{entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
          </div>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Date</th>
                  <th style={{ width: 90 }}>Voucher #</th>
                  <th>Memo / Description</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Debit</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Credit</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr key={i}>
                    <td className="td-mono">{e.date || '—'}</td>
                    <td className="td-mono" style={{ fontWeight: 600 }}>{e.voucherNumber}</td>
                    <td style={{ color: 'var(--text-2)', maxWidth: 260 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.memo || e.description || '—'}
                      </div>
                    </td>
                    <td className="td-mono" style={{ textAlign: 'right' }}>
                      {e.debit > 0 ? fmt(e.debit, currency) : '—'}
                    </td>
                    <td className="td-mono" style={{ textAlign: 'right' }}>
                      {e.credit > 0 ? fmt(e.credit, currency) : '—'}
                    </td>
                    <td className="td-mono" style={{
                      textAlign: 'right',
                      color: e.running * nb < 0 ? 'var(--red)' : 'var(--text-1)',
                    }}>
                      {fmt(Math.abs(e.running), currency)}
                      <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 3 }}>
                        {e.running * nb >= 0 ? 'DR' : 'CR'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border2)' }}>
                  <td colSpan={3} style={{ fontWeight: 700, fontSize: 12, paddingTop: 8 }}>Closing Balance</td>
                  <td className="td-mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {fmt(entries.reduce((s, e) => s + e.debit, 0), currency)}
                  </td>
                  <td className="td-mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {fmt(entries.reduce((s, e) => s + e.credit, 0), currency)}
                  </td>
                  <td className="td-mono" style={{
                    textAlign: 'right', fontWeight: 700,
                    color: displayBalance < 0 ? 'var(--red)' : 'var(--green)',
                  }}>
                    {fmt(Math.abs(displayBalance), currency)}
                    <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 3 }}>
                      {displayBalance >= 0 ? 'DR' : 'CR'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AccountListing() {
  const { accounts, vouchers, settings } = useStore()
  const cur = settings.currency

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [exporting, setExporting] = useState(false)

  function clearFilters() {
    setSearch('')
    setTypeFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = search || typeFilter !== 'all' || dateFrom || dateTo

  // Build per-account entry lists from vouchers, respecting date filters
  const accountSections = useMemo(() => {
    const entryMap = {}

    vouchers.forEach(v => {
      const rawDate = v.date || ''
      const displayDate = v.date || fmtDate(v.createdAt)

      // Date range filter — applied at the voucher level
      if (dateFrom && rawDate && rawDate < dateFrom) return
      if (dateTo && rawDate && rawDate > dateTo) return

      ;(v.entries || []).forEach(e => {
        if (!e.account) return
        const key = e.account.trim().toLowerCase()
        if (!entryMap[key]) entryMap[key] = []
        entryMap[key].push({
          rawDate,
          date: displayDate,
          voucherNumber: v.number,
          memo: v.memo,
          description: e.description,
          debit: parseFloat(e.debit || 0),
          credit: parseFloat(e.credit || 0),
        })
      })
    })

    // Build sections for registered CoA accounts
    const sections = accounts
      .filter(a => entryMap[a.name.trim().toLowerCase()]?.length > 0)
      .map(a => {
        const entries = [...(entryMap[a.name.trim().toLowerCase()] || [])]
        entries.sort((x, y) => {
          if (x.rawDate < y.rawDate) return -1
          if (x.rawDate > y.rawDate) return 1
          return x.voucherNumber.localeCompare(y.voucherNumber)
        })
        const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
        const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
        return { account: a, entries, closingBalance: totalDebit - totalCredit }
      })

    // Orphan accounts (not in CoA)
    const registered = new Set(accounts.map(a => a.name.trim().toLowerCase()))
    Object.entries(entryMap).forEach(([key, entries]) => {
      if (registered.has(key)) return
      const originalName = (() => {
        for (const v of vouchers) {
          for (const e of (v.entries || [])) {
            if (e.account?.trim().toLowerCase() === key) return e.account.trim()
          }
        }
        return key
      })()
      const sorted = [...entries].sort((x, y) => x.rawDate < y.rawDate ? -1 : x.rawDate > y.rawDate ? 1 : 0)
      const totalDebit = sorted.reduce((s, e) => s + e.debit, 0)
      const totalCredit = sorted.reduce((s, e) => s + e.credit, 0)
      sections.push({
        account: { name: originalName + ' ⚠', code: '', type: 'asset' },
        entries: sorted,
        closingBalance: totalDebit - totalCredit,
      })
    })

    return sections
  }, [accounts, vouchers, dateFrom, dateTo])

  // Apply account search + type filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accountSections.filter(s => {
      const matchSearch = !q || s.account.name.toLowerCase().includes(q) || (s.account.code || '').toLowerCase().includes(q)
      const matchType = typeFilter === 'all' || s.account.type === typeFilter
      return matchSearch && matchType
    })
  }, [accountSections, search, typeFilter])

  const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense']

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Account Listing</div>
          <div className="page-sub">Transaction history per account with running balances</div>
        </div>
        <button
          className="btn btn-ghost"
          disabled={filtered.length === 0 || exporting}
          onClick={async () => {
            setExporting(true)
            try { await exportToExcel(filtered, cur, dateFrom, dateTo) }
            finally { setExporting(false) }
          }}
        >
          <Download size={15} /> {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      {/* Filters toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center',
      }}>
        {/* Account search */}
        <div className="search-bar" style={{ minWidth: 200, flex: '1 1 200px' }}>
          <Search size={14} color="var(--text-3)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search account name or code…"
          />
        </div>

        {/* Type filter */}
        <select
          className="form-select"
          style={{ width: 'auto', fontSize: 12 }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          {TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}s</option>
          ))}
        </select>

        {/* Date from */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>From</label>
          <input
            className="form-input"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', width: 140 }}
          />
        </div>

        {/* Date to */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>To</label>
          <input
            className="form-input"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', width: 140 }}
          />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={clearFilters}>
            <X size={13} /> Clear
          </button>
        )}

        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>
          {filtered.length} account{filtered.length !== 1 ? 's' : ''}
          {dateFrom || dateTo ? ` · ${dateFrom || '…'} → ${dateTo || '…'}` : ''}
        </span>
      </div>

      {accountSections.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BookOpen size={36} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No transactions yet</div>
            <div style={{ fontSize: 13 }}>Post vouchers to see the account listing</div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BookOpen size={36} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No accounts match your filters</div>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={clearFilters}>
              <X size={13} /> Clear filters
            </button>
          </div>
        </div>
      ) : (
        filtered.map((section, i) => (
          <AccountSection
            key={section.account.name + i}
            {...section}
            currency={cur}
          />
        ))
      )}
    </div>
  )
}
