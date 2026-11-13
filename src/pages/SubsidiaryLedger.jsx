import { useState, useMemo, Fragment } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, formatTin, buildSubsidiaryLedger, buildLedger, postedOnly, accountKey, todayLocal, buildAging, AGING_BUCKETS } from '../utils'
import { showToast } from '../lib/toast'
import { Download, Search, ChevronDown, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react'
import TallyEmpty from '../components/TallyEmpty.jsx'

// Subsidiary Ledger — the balance per customer (Accounts Receivable) and per
// supplier (Accounts Payable), with every entry behind it. The parts always
// add up to the control account; anything that can't be matched to a client
// is shown as "Unassigned" with a picker to fix it, rather than guessed.
const KINDS = {
  receivable: { tab: 'Customers', control: 'Accounts Receivable', who: 'customer', owes: 'Owes you', negative: 'overpaid' },
  payable: { tab: 'Suppliers', control: 'Accounts Payable', who: 'supplier', owes: 'You owe', negative: 'advance paid' },
}

// Footer cells get the same padding as body cells (the stylesheet only pads tbody).
const FOOT = { padding: 'var(--density-td-p)', fontWeight: 700, borderTop: '2px solid var(--border2)' }

async function exportToExcel(ledger, kind, asOf, currency) {
  const XLSX = await import('xlsx')
  const k = KINDS[kind]
  const rows = [{ Name: `Subsidiary Ledger — ${k.tab} (${ledger.controls.join(', ')}) as of ${asOf}` }, {}]
  const groups = [...ledger.rows, ...(ledger.unassigned ? [{ ...ledger.unassigned, client: { name: 'Unassigned' } }] : [])]
  for (const g of groups) {
    rows.push({ Name: g.client.name, TIN: g.client.tin ? formatTin(g.client.tin) : '', Balance: g.balance })
    for (const e of g.entries) rows.push({ Date: e.date, 'Voucher #': e.number, Description: e.description, Debit: e.debit || 0, Credit: e.credit || 0, Balance: e.running })
    rows.push({})
  }
  rows.push({ Name: `Total (${currency || 'PHP'})`, Balance: ledger.total })
  const ws = XLSX.utils.json_to_sheet(rows, { header: ['Name', 'TIN', 'Date', 'Voucher #', 'Description', 'Debit', 'Credit', 'Balance'] })
  const money = '#,##0.00;(#,##0.00);"-"'
  for (let r = 1; r <= rows.length; r++) for (const c of [5, 6, 7]) {
    const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = money
  }
  ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 13 }, { wch: 13 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, k.tab)
  XLSX.writeFile(wb, `dbc-subsidiary-ledger-${kind}-${asOf}.xlsx`)
}

async function exportAgingToExcel(aging, kind, asOf, currency) {
  const XLSX = await import('xlsx')
  const k = KINDS[kind]
  const head = [k.tab.slice(0, -1), ...AGING_BUCKETS.map(b => b.label), 'Total']
  const line = (name, r) => [name, ...AGING_BUCKETS.map(b => r.buckets[b.key]), r.balance]
  const aoa = [[`Aging — ${k.tab} as of ${asOf} (${currency || 'PHP'})`], [], head,
    ...aging.rows.map(r => line(r.client.name, r)),
    ...(aging.unassigned ? [line('Unassigned', aging.unassigned)] : []),
    ['Total', ...AGING_BUCKETS.map(b => aging.totals[b.key]), aging.total],
    [], ['Aged by due date for Billing invoices, otherwise by entry date. Payments are applied to the oldest charges first.']]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const money = '#,##0.00;(#,##0.00);"-"'
  for (let r = 3; r < aoa.length; r++) for (let c = 1; c <= 6; c++) {
    const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = money
  }
  ws['!cols'] = [{ wch: 30 }, ...Array(6).fill({ wch: 14 })]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `${k.tab} aging`)
  XLSX.writeFile(wb, `dbc-aging-${kind}-${asOf}.xlsx`)
}

export default function SubsidiaryLedger() {
  const { vouchers, accounts, clients, bills, settings, updateVoucher, isDateLocked } = useStore()
  const cur = settings?.currency
  const [kind, setKind] = useState('receivable')
  const [asOf, setAsOf] = useState(todayLocal())
  const [search, setSearch] = useState('')
  const [hideSettled, setHideSettled] = useState(true)
  const [open, setOpen] = useState(() => new Set())
  const [exporting, setExporting] = useState(false)
  const [view, setView] = useState('balances') // 'balances' | 'aging'
  const k = KINDS[kind]

  const ledger = useMemo(
    () => buildSubsidiaryLedger({ vouchers, accounts, clients, bills, kind, asOf: asOf || null }),
    [vouchers, accounts, clients, bills, kind, asOf],
  )
  // The control account's balance computed SEPARATELY from the general
  // ledger — a real cross-check that the subsidiary ledger adds up.
  const glBalance = useMemo(() => {
    const ledgerMap = buildLedger(postedOnly(vouchers).filter(v => !asOf || !v.date || v.date <= asOf))
    const sign = kind === 'receivable' ? 1 : -1
    return Math.round(ledger.controls.reduce((t, name) => { const r = ledgerMap[accountKey(name)]; return t + (r ? sign * (r.debit - r.credit) : 0) }, 0) * 100) / 100
  }, [vouchers, asOf, kind, ledger.controls])
  const reconciles = Math.abs(glBalance - ledger.total) < 0.005
  const aging = useMemo(() => buildAging(ledger, { kind, asOf: asOf || todayLocal(), bills }), [ledger, kind, asOf, bills])

  const q = search.trim().toLowerCase()
  const rows = ledger.rows.filter(g => (!hideSettled || Math.abs(g.balance) >= 0.005) && (!q || g.client.name.toLowerCase().includes(q)))
  const toggle = id => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function assign(entry, clientId) {
    if (!clientId) return
    const v = vouchers.find(x => x.id === entry.voucherId)
    if (!v) return
    const entries = (v.entries || []).map((e, i) => (i === entry.lineIndex ? { ...e, clientId } : e))
    // Only confirm when it really saved — a voucher in a closed period is
    // refused (the store shows why), and must not also say "Assigned".
    if (await updateVoucher(v.id, { entries })) showToast(`Assigned to ${clients.find(c => c.id === clientId)?.name || 'client'}.`, 'success')
  }

  const header = (
    <div className="page-header">
      <div>
        <div className="page-h1">Subsidiary Ledger</div>
        <div className="page-sub">What each customer owes you, and what you owe each supplier</div>
      </div>
      <button className="btn btn-ghost" disabled={!ledger.rows.length && !ledger.unassigned || exporting}
        onClick={async () => { setExporting(true); try { await (view === 'aging' ? exportAgingToExcel(aging, kind, asOf || todayLocal(), cur) : exportToExcel(ledger, kind, asOf || todayLocal(), cur)) } finally { setExporting(false) } }}>
        <Download size={15} /> {exporting ? 'Exporting…' : 'Export to Excel'}
      </button>
    </div>
  )

  const tabs = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
      <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        {Object.entries(KINDS).map(([key, v]) => (
          <button key={key} onClick={() => { setKind(key); setOpen(new Set()) }}
            style={{ padding: '7px 14px', fontSize: 13, border: 'none', cursor: 'pointer', fontWeight: kind === key ? 600 : 400,
              background: kind === key ? 'var(--accent)' : 'var(--surface)', color: kind === key ? 'var(--accent-text, #fff)' : 'var(--text-2)' }}>
            {v.tab} <span style={{ opacity: 0.75, fontSize: 11.5 }}>({v.control.replace('Accounts ', '')})</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        {[['balances', 'Balances'], ['aging', 'Aging']].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)}
            style={{ padding: '7px 12px', fontSize: 13, border: 'none', cursor: 'pointer', fontWeight: view === key ? 600 : 400,
              background: view === key ? 'var(--accent-subtle)' : 'var(--surface)', color: view === key ? 'var(--accent)' : 'var(--text-2)' }}>
            {label}
          </button>
        ))}
      </div>
      <div className="search-bar" style={{ minWidth: 180, flex: '1 1 180px' }}>
        <Search size={14} color="var(--text-3)" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${k.who}s…`} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)' }}>
        As of <input type="date" className="form-input" style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }} value={asOf} onChange={e => setAsOf(e.target.value)} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={hideSettled} onChange={e => setHideSettled(e.target.checked)} /> Hide settled
      </label>
    </div>
  )

  if (!ledger.controls.length) {
    return (
      <div className="page-content">{header}{tabs}
        <div className="card">
          <TallyEmpty title={`No ${k.control} account yet`}>
            The {k.tab.toLowerCase()} ledger follows an <b>{kind === 'receivable' ? 'Asset' : 'Liability'}</b> account named like "{k.control}" or
            "Trade {kind === 'receivable' ? 'Receivables' : 'Payables'}". Add one in Chart of Accounts (the starter chart includes it).
          </TallyEmpty>
        </div>
      </div>
    )
  }

  const entryTable = (g, assignable) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ fontSize: 12, minWidth: 620 }}>
        <thead><tr>
          <th style={{ width: 92 }}>Date</th><th style={{ width: 110 }}>Voucher #</th><th>Description</th>
          <th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th>
          <th style={{ textAlign: 'right' }}>{assignable ? `Assign to a ${k.who}` : 'Balance'}</th>
        </tr></thead>
        <tbody>
          {g.entries.map((e, i) => (
            <tr key={e.voucherId + ':' + e.lineIndex + ':' + i}>
              <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
              <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{e.number}</td>
              <td style={{ color: 'var(--text-2)' }}>{e.description}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.debit ? fmt(e.debit, cur) : '—'}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.credit ? fmt(e.credit, cur) : '—'}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                {assignable && isDateLocked(e.date) ? (
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }} title="Reopen this period in Closing Books to change it">Locked (closed period)</span>
                ) : assignable ? (
                  <select className="form-select" style={{ fontSize: 12, padding: '3px 6px', width: 'auto', maxWidth: 190 }} defaultValue="" onChange={ev => assign(e, ev.target.value)}>
                    <option value="">Choose…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : fmt(e.running, cur)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="page-content">
      {header}
      {tabs}

      <div className="card" style={{ marginBottom: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
        {reconciles ? <CheckCircle size={16} color="var(--green)" /> : <AlertCircle size={16} color="var(--red)" />}
        <span>
          {k.tab} <b style={{ fontFamily: 'var(--mono)' }}>{fmt(ledger.assignedTotal, cur)}</b>
          {ledger.unassigned && <> + Unassigned <b style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{fmt(ledger.unassigned.balance, cur)}</b></>}
          {' '}= {ledger.controls.join(' + ')} <b style={{ fontFamily: 'var(--mono)' }}>{fmt(glBalance, cur)}</b>
          {reconciles ? <span style={{ color: 'var(--green)' }}> — matches the general ledger</span> : <span style={{ color: 'var(--red)' }}> — doesn't match the general ledger</span>}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginLeft: 'auto' }}>Posted vouchers only</span>
      </div>

      {view === 'aging' ? (() => {
        const agingRows = aging.rows.filter(r => (!hideSettled || Math.abs(r.balance) >= 0.005) && (!q || r.client.name.toLowerCase().includes(q)))
        const cell = (v, key) => (
          <td key={key} style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
            color: !v ? 'var(--text-3)' : v < 0 ? 'var(--amber)' : key === 'd90' || key === 'd61_90' ? 'var(--red)' : key === 'd31_60' ? 'var(--amber)' : undefined,
            fontWeight: v && (key === 'd90' || key === 'd61_90') ? 600 : undefined }}>
            {v ? fmt(v, cur) : '—'}
          </td>
        )
        return (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ fontSize: 13, minWidth: 760 }}>
                <thead><tr>
                  <th>{k.tab.slice(0, -1)}</th>
                  {AGING_BUCKETS.map(b => <th key={b.key} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{b.label}</th>)}
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr></thead>
                <tbody>
                  {agingRows.map(r => (
                    <tr key={r.clientId}>
                      <td style={{ fontWeight: 600 }}>{r.client.name}</td>
                      {AGING_BUCKETS.map(b => cell(r.buckets[b.key], b.key))}
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(r.balance, cur)}</td>
                    </tr>
                  ))}
                  {aging.unassigned && (
                    <tr style={{ background: 'var(--amber-dim)' }}>
                      <td style={{ fontWeight: 600, color: 'var(--amber)' }}>Unassigned</td>
                      {AGING_BUCKETS.map(b => cell(aging.unassigned.buckets[b.key], b.key))}
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(aging.unassigned.balance, cur)}</td>
                    </tr>
                  )}
                  {!agingRows.length && !aging.unassigned && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>{q ? `No ${k.who}s match your search.` : `No open ${k.who} balances.`}</td></tr>
                  )}
                </tbody>
                <tfoot><tr>
                  <td style={FOOT}>Total</td>
                  {AGING_BUCKETS.map(b => <td key={b.key} style={{ ...FOOT, textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: aging.totals[b.key] ? undefined : 'var(--text-3)' }}>{aging.totals[b.key] ? fmt(aging.totals[b.key], cur) : '—'}</td>)}
                  <td style={{ ...FOOT, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(aging.total, cur)}</td>
                </tr></tfoot>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '8px 14px', borderTop: '1px solid var(--border)', lineHeight: 1.5 }}>
              Aged by due date for Billing invoices, otherwise by the entry date. Payments are applied to the oldest charges first.
              {aging.unassigned && ' Assign the unassigned lines (in Balances) so they age under the right ' + k.who + '.'}
            </div>
          </div>
        )
      })() : <>
      {ledger.unassigned && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--amber)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => toggle('__unassigned')}>
            {open.has('__unassigned') ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <AlertCircle size={15} color="var(--amber)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>Unassigned — {ledger.unassigned.entries.length} entr{ledger.unassigned.entries.length !== 1 ? 'ies' : 'y'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>These lines don't say which {k.who} they're for. Open to assign each one.</div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--amber)' }}>{fmt(ledger.unassigned.balance, cur)}</div>
          </div>
          {open.has('__unassigned') && <div style={{ marginTop: 10 }}>{entryTable(ledger.unassigned, true)}</div>}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card">
          {ledger.rows.length === 0
            ? <TallyEmpty title={`No ${k.who} balances yet`}>Post vouchers or invoices that use {ledger.controls.join(' or ')}, and each {k.who}'s balance shows up here.</TallyEmpty>
            : <TallyEmpty mood="thinking" title={q ? `No ${k.who}s match your search` : `Every ${k.who} is settled`}>{q ? 'Try a different name.' : 'Untick "Hide settled" to see them all.'}</TallyEmpty>}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 13 }}>
              <thead><tr>
                <th style={{ width: 28 }}></th><th>{k.tab.slice(0, -1)}</th><th>TIN</th><th style={{ textAlign: 'right' }}>Entries</th>
                <th style={{ textAlign: 'right' }}>{k.owes}</th>
              </tr></thead>
              <tbody>
                {rows.map(g => (
                  <Fragment key={g.clientId}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggle(g.clientId)}>
                      <td>{open.has(g.clientId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td style={{ fontWeight: 600 }}>{g.client.name}</td>
                      <td style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 12 }}>{g.client.tin ? formatTin(g.client.tin) : '—'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>{g.entries.length}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: g.balance < 0 ? 'var(--amber)' : undefined }}>
                        {fmt(Math.abs(g.balance), cur)}{g.balance < 0 && <span style={{ fontSize: 11, fontWeight: 400 }}> ({k.negative})</span>}
                      </td>
                    </tr>
                    {open.has(g.clientId) && (
                      <tr><td colSpan={5} style={{ background: 'var(--bg)', padding: '8px 12px 12px' }}>{entryTable(g, false)}</td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={FOOT}></td><td colSpan={3} style={FOOT}>Total {k.tab.toLowerCase()} shown</td>
                <td style={{ ...FOOT, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(rows.reduce((t, g) => t + g.balance, 0), cur)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}
