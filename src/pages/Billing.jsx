import { useState, useRef } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate } from '../utils'
import { Plus, X, Trash2, Pencil, Search, Receipt, CheckCircle, Clock, AlertTriangle, Printer } from 'lucide-react'

// ── Print Invoice ────────────────────────────────────────────────────────────
function printInvoice(bill, settings, clients = []) {
  const w = window.open('', '_blank', 'width=900,height=700')
  const lines = bill.lines || []
  const subtotal = bill.subtotal ?? lines.reduce((s, l) => s + parseFloat(l.qty || 0) * parseFloat(l.rate || 0), 0)
  const tax = bill.tax ?? 0
  const total = bill.total ?? subtotal + tax
  const taxRate = settings.taxScheme === 'percentage' ? (settings.percentageTaxRate ?? 3) : (settings.vatRate ?? 12)
  const taxLabel = settings.taxScheme === 'percentage' ? 'Percentage Tax' : 'VAT'
  const client = clients.find(c => c.id === bill.clientId)

  // Format date nicely e.g. "June 27, 2026"
  function fmtPrint(iso) {
    if (!iso) return '—'
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const statusLabel = (bill.status || 'unpaid').toUpperCase()
  const statusColor = bill.status === 'paid' ? '#16a34a' : bill.status === 'overdue' ? '#dc2626' : '#b45309'

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice ${bill.number}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      color: #111827;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      max-width: 760px;
      margin: 0 auto;
      padding: 56px 56px 64px;
    }

    /* ── Top accent bar ── */
    .accent-bar {
      height: 5px;
      background: #1e3a5f;
      border-radius: 3px 3px 0 0;
      margin-bottom: 40px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 44px;
    }
    .firm-block { flex: 1; }
    .firm-name {
      font-size: 21px;
      font-weight: 800;
      color: #111827;
      letter-spacing: -0.3px;
      margin-bottom: 6px;
    }
    .firm-details {
      font-size: 11.5px;
      color: #6b7280;
      line-height: 1.7;
    }
    .invoice-block { text-align: right; }
    .invoice-label {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 3px;
      color: #1e3a5f;
      margin-bottom: 12px;
    }
    .invoice-meta-row {
      font-size: 12px;
      color: #6b7280;
      line-height: 2;
    }
    .invoice-meta-row span {
      display: inline-block;
      width: 42px;
      font-weight: 600;
      color: #374151;
    }

    /* ── Thin rule ── */
    .rule {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 0 0 36px;
    }

    /* ── Bill To / Status row ── */
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 36px;
      gap: 24px;
    }
    .section-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #9ca3af;
      margin-bottom: 7px;
    }
    .client-name {
      font-size: 17px;
      font-weight: 700;
      color: #111827;
    }
    .status-pill {
      display: inline-block;
      padding: 5px 16px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: ${statusColor};
      border: 1.5px solid ${statusColor};
    }

    /* ── Line items table ── */
    table { width: 100%; border-collapse: collapse; }
    thead tr {
      border-bottom: 2px solid #1e3a5f;
    }
    thead th {
      padding: 9px 12px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #1e3a5f;
      text-align: left;
    }
    thead th.r { text-align: right; }
    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody tr:last-child { border-bottom: 2px solid #e5e7eb; }
    tbody td {
      padding: 11px 12px;
      font-size: 13px;
      color: #374151;
    }
    tbody td.r {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }
    tbody td.desc { color: #111827; }

    /* ── Totals ── */
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
      margin-bottom: 40px;
    }
    .totals-table { width: 260px; }
    .t-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
      font-size: 13px;
      border-bottom: 1px solid #f3f4f6;
      color: #6b7280;
    }
    .t-row .val {
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      color: #374151;
    }
    .t-total {
      display: flex;
      justify-content: space-between;
      padding: 11px 14px;
      margin-top: 4px;
      background: #1e3a5f;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 800;
      color: #fff;
    }
    .t-total .val { font-variant-numeric: tabular-nums; }

    /* ── Notes ── */
    .notes-block {
      padding: 14px 18px;
      background: #f9fafb;
      border-left: 3px solid #1e3a5f;
      border-radius: 0 6px 6px 0;
      margin-bottom: 48px;
    }
    .notes-block p {
      font-size: 12.5px;
      color: #4b5563;
      line-height: 1.65;
      margin-top: 6px;
    }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 18px;
      text-align: center;
    }
    .footer p {
      font-size: 12px;
      color: #9ca3af;
      font-style: italic;
    }

    @media print {
      .page { padding: 0; }
      @page { size: A4; margin: 14mm 16mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="accent-bar"></div>

  <!-- Header -->
  <div class="header">
    <div class="firm-block">
      <div class="firm-name">${settings.company || 'Your Firm'}</div>
      ${settings.address
        ? `<div class="firm-details">${settings.address.replace(/\n/g, '<br>')}</div>`
        : ''}
      ${settings.tin ? `<div class="firm-details">TIN: ${settings.tin}</div>` : ''}
    </div>
    <div class="invoice-block">
      <div class="invoice-label">INVOICE</div>
      <div class="invoice-meta-row">
        <span>No.</span> ${bill.number}<br>
        <span>Date</span> ${fmtPrint(bill.date)}<br>
        ${bill.dueDate ? `<span>Due</span> ${fmtPrint(bill.dueDate)}` : ''}
      </div>
    </div>
  </div>

  <hr class="rule">

  <!-- Bill To / Status -->
  <div class="meta-row">
    <div>
      <div class="section-label">Bill To</div>
      <div class="client-name">${bill.clientName || '—'}</div>
      ${client?.address ? `<div style="font-size:12px;color:#555;margin-top:2px">${client.address}</div>` : ''}
      ${client?.tin ? `<div style="font-size:12px;color:#555;margin-top:2px">TIN: ${client.tin}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="section-label">Status</div>
      <div class="status-pill">${statusLabel}</div>
    </div>
  </div>

  <!-- Line items -->
  <table>
    <thead>
      <tr>
        <th style="width:52%">Description</th>
        <th class="r" style="width:11%">Qty</th>
        <th class="r" style="width:18%">Unit Price</th>
        <th class="r" style="width:19%">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map(l => {
        const amt = parseFloat(l.qty || 0) * parseFloat(l.rate || 0)
        return `<tr>
          <td class="desc">${l.description || '—'}</td>
          <td class="r">${l.qty}</td>
          <td class="r">${fmt(parseFloat(l.rate || 0))}</td>
          <td class="r">${fmt(amt)}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-wrap">
    <div class="totals-table">
      <div class="t-row">
        <span>Subtotal</span>
        <span class="val">${fmt(subtotal)}</span>
      </div>
      <div class="t-row">
        <span>${taxLabel} (${taxRate}%)</span>
        <span class="val">${fmt(tax)}</span>
      </div>
      <div class="t-total">
        <span>Total Due</span>
        <span class="val">${fmt(total)}</span>
      </div>
    </div>
  </div>

  <!-- Notes -->
  ${bill.notes ? `
  <div class="notes-block">
    <div class="section-label">Notes</div>
    <p>${bill.notes.replace(/\n/g, '<br>')}</p>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <p>Thank you for your business.</p>
  </div>

</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`)
  w.document.close()
}

// ── LineRow ──────────────────────────────────────────────────────────────────
function LineRow({ line, onChange, onRemove }) {
  const subtotal = parseFloat(line.qty || 0) * parseFloat(line.rate || 0)
  return (
    <tr>
      <td>
        <input className="form-input" style={{ fontSize: 12, padding: '5px 8px' }}
          value={line.description} onChange={e => onChange({ ...line, description: e.target.value })}
          placeholder="Service / Item description" />
      </td>
      <td>
        <input className="form-input" style={{ fontSize: 12, padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}
          type="number" min="1" value={line.qty}
          onChange={e => onChange({ ...line, qty: e.target.value })} />
      </td>
      <td>
        <input className="form-input" style={{ fontSize: 12, padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}
          type="number" min="0" step="0.01" value={line.rate}
          onChange={e => onChange({ ...line, rate: e.target.value })} />
      </td>
      <td className="td-mono" style={{ textAlign: 'right', fontSize: 12 }}>{fmt(subtotal)}</td>
      <td>
        <button className="icon-btn" onClick={onRemove} style={{ color: 'var(--red)' }}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
}

// ── MarkPaidModal ────────────────────────────────────────────────────────────
function MarkPaidModal({ bill, onClose, onConfirm, cashAccounts }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [cashAccount, setCashAccount] = useState(cashAccounts[0]?.name || 'Cash')

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <span className="modal-title">Mark as Paid — {bill.number}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '4px 0 16px', fontSize: 13, color: 'var(--text-2)' }}>
          This will post a journal entry:
          <div style={{ margin: '10px 0', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7 }}>
            DR {cashAccount}<br />
            &nbsp;&nbsp;CR Accounts Receivable<br />
            <span style={{ color: 'var(--text-3)' }}>Amount: {fmt(bill.total)}</span>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Payment Date</label>
          <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Deposit To (Cash / Bank Account)</label>
          <select className="form-select" value={cashAccount} onChange={e => setCashAccount(e.target.value)}>
            {cashAccounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            {cashAccounts.length === 0 && <option value="Cash">Cash</option>}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Only asset accounts shown.</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onConfirm({ paidDate: date, cashAccount })}>
            <CheckCircle size={14} /> Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BillModal ────────────────────────────────────────────────────────────────
function BillModal({ bill, onClose, onSave, clients, bills, accounts, taxRate, taxLabel = 'VAT' }) {
  const blankLine = () => ({ id: crypto.randomUUID(), description: '', qty: 1, rate: '' })
  const [form, setForm] = useState(bill || {
    clientId: '', clientName: '',
    date: new Date().toISOString().slice(0, 10),
    dueDate: '', lines: [blankLine()], notes: '', applyTax: true,
    receivableAccount: '',
    revenueAccount: '',
  })

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const subtotal = form.lines.reduce((s, l) => s + parseFloat(l.qty || 0) * parseFloat(l.rate || 0), 0)
  const tax = form.applyTax ? subtotal * (taxRate / 100) : 0
  const total = subtotal + tax

  function setClient(id) {
    const c = clients.find(cl => cl.id === id)
    setForm(f => ({ ...f, clientId: id, clientName: c?.name || '' }))
  }

  // Receivable accounts (asset type) and revenue accounts (revenue type)
  const receivableAccounts = accounts.filter(a => a.type === 'asset')
  const revenueAccounts = accounts.filter(a => a.type === 'revenue')
  const defaultAR = receivableAccounts.find(a => a.name.toLowerCase().includes('receivable'))
  const defaultRev = revenueAccounts.find(a => a.name.toLowerCase().includes('service')) || revenueAccounts[0]

  // Outstanding invoices for selected client
  const clientOutstanding = form.clientId
    ? bills.filter(b => b.clientId === form.clientId && b.status !== 'paid' && b.id !== bill?.id)
    : []
  const outstandingTotal = clientOutstanding.reduce((s, b) => s + parseFloat(b.total || 0), 0)

  // The receivable account that will be used
  const selectedAR = form.receivableAccount || defaultAR?.name || 'Accounts Receivable'

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 740 }}>
        <div className="modal-header">
          <span className="modal-title">{bill ? 'Edit Invoice' : 'New Invoice'}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Client + dates */}
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label">Client *</label>
            <select className="form-select" value={form.clientId} onChange={e => setClient(e.target.value)}>
              <option value="">— Select Client —</option>
              {clients.map(c => {
                const unpaid = bills.filter(b => b.clientId === c.id && b.status !== 'paid')
                return (
                  <option key={c.id} value={c.id}>
                    {c.name}{unpaid.length > 0 ? ` (${unpaid.length} unpaid)` : ''}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Invoice Date</label>
            <input className="form-input" type="date" value={form.date} onChange={e => setF('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Due Date</label>
            <input className="form-input" type="date" value={form.dueDate} onChange={e => setF('dueDate', e.target.value)} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {[7, 14, 30, 60].map(d => (
                <button key={d} type="button" className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 7px' }}
                  onClick={() => {
                    const base = form.date ? new Date(form.date + 'T00:00:00') : new Date()
                    base.setDate(base.getDate() + d)
                    setF('dueDate', base.toISOString().slice(0, 10))
                  }}>
                  +{d}d
                </button>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
            <input type="checkbox" id="applyTax" checked={form.applyTax}
              onChange={e => setF('applyTax', e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            <label htmlFor="applyTax" className="form-label" style={{ marginBottom: 0 }}>Apply {taxRate}% {taxLabel}</label>
          </div>
        </div>

        {/* Accounting Entry Preview */}
        <div style={{
          marginBottom: 14, padding: '12px 14px',
          background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-3)', marginBottom: 10 }}>
            Accounting Entry — on invoice creation
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 8, alignItems: 'end' }}>
            {/* DR side */}
            <div>
              <label className="form-label" style={{ fontSize: 11, color: 'var(--accent)' }}>DR — Debit (Receivable)</label>
              <select className="form-select" style={{ fontSize: 12 }}
                value={form.receivableAccount || defaultAR?.name || ''}
                onChange={e => setF('receivableAccount', e.target.value)}>
                {receivableAccounts.map(a => (
                  <option key={a.id} value={a.name}>
                    {a.code ? `${a.code} · ` : ''}{a.name}
                  </option>
                ))}
                {receivableAccounts.length === 0 && <option value="Accounts Receivable">Accounts Receivable</option>}
              </select>
            </div>
            {/* Arrow */}
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 16, paddingBottom: 6 }}>⇄</div>
            {/* CR side */}
            <div>
              <label className="form-label" style={{ fontSize: 11, color: 'var(--green)' }}>CR — Credit (Revenue)</label>
              <select className="form-select" style={{ fontSize: 12 }}
                value={form.revenueAccount || defaultRev?.name || ''}
                onChange={e => setF('revenueAccount', e.target.value)}>
                {revenueAccounts.map(a => (
                  <option key={a.id} value={a.name}>
                    {a.code ? `${a.code} · ` : ''}{a.name}
                  </option>
                ))}
                {revenueAccounts.length === 0 && <option value="Service Revenue">Service Revenue</option>}
              </select>
            </div>
          </div>
          {total > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>Amount to be posted</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmt(total)}</span>
            </div>
          )}
        </div>

        {/* Outstanding receivables warning */}
        {clientOutstanding.length > 0 && (
          <div style={{ marginBottom: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--amber, #f59e0b)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, background: 'rgba(245,158,11,0.1)', color: 'var(--amber, #f59e0b)', display: 'flex', justifyContent: 'space-between' }}>
              <span>⚠ {form.clientName} has {clientOutstanding.length} unpaid invoice{clientOutstanding.length !== 1 ? 's' : ''}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmt(outstandingTotal)} outstanding</span>
            </div>
            <div style={{ padding: '0 12px' }}>
              {clientOutstanding.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <div>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{b.number}</span>
                    {b.date && <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>{b.date}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--mono)' }}>{fmt(b.total)}</span>
                    <span className={`badge ${b.status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Line items */}
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ fontSize: 12, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Description</th>
                <th style={{ textAlign: 'right', width: '12%' }}>Qty</th>
                <th style={{ textAlign: 'right', width: '18%' }}>Rate</th>
                <th style={{ textAlign: 'right', width: '20%' }}>Amount</th>
                <th style={{ width: '5%' }}></th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => (
                <LineRow key={l.id} line={l}
                  onChange={upd => setF('lines', form.lines.map((ll, idx) => idx === i ? upd : ll))}
                  onRemove={() => setF('lines', form.lines.filter((_, idx) => idx !== i))}
                />
              ))}
            </tbody>
          </table>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={() => setF('lines', [...form.lines, blankLine()])} style={{ marginBottom: 16 }}>
          <Plus size={13} /> Add Line
        </button>

        {/* Totals — clean right-aligned breakdown */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, marginBottom: 4 }}>
          <div style={{
            width: 260, maxWidth: '100%', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            {[
              { label: 'Subtotal', val: subtotal },
              { label: `${taxLabel} (${taxRate}%)`, val: tax },
            ].map(r => (
              <div key={r.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 14px', borderBottom: '1px solid var(--border)',
                fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-2)' }}>{r.label}</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmt(r.val)}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--surface2)',
              fontSize: 14, fontWeight: 800,
            }}>
              <span>Total</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(total)}</span>
            </div>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes}
            onChange={e => setF('notes', e.target.value)}
            placeholder="Payment terms, bank details, thank you note..." />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            disabled={!form.clientId || form.lines.every(l => !l.rate)}
            onClick={() => onSave({
              ...form, subtotal, tax, total,
              receivableAccount: form.receivableAccount || defaultAR?.name || 'Accounts Receivable',
              revenueAccount: form.revenueAccount || defaultRev?.name || 'Service Revenue',
            })}>
            {bill ? 'Save Changes' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status icons ─────────────────────────────────────────────────────────────
const STATUS_ICONS = {
  paid: <CheckCircle size={10} />,
  unpaid: <Clock size={10} />,
  overdue: <AlertTriangle size={10} />,
}

// ── Main Billing Page ────────────────────────────────────────────────────────
export default function Billing() {
  const { bills, addBill, updateBill, deleteBill, clients, accounts, settings } = useStore()
  const [modal, setModal] = useState(null)
  const [payModal, setPayModal] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const cashAccounts = accounts.filter(a => a.type === 'asset')

  const filtered = bills.filter(b => {
    const q = search.toLowerCase()
    return (b.number.toLowerCase().includes(q) || (b.clientName || '').toLowerCase().includes(q))
      && (statusFilter === 'all' || b.status === statusFilter)
  })

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Billing</div>
          <div className="page-sub">{bills.length} invoice{bills.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={15} /> New Invoice
        </button>
      </div>

      <div className="toolbar">
        <div className="search-bar">
          <Search size={14} color="var(--text-3)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices..." />
        </div>
        <select className="form-select" style={{ width: 'auto', fontSize: 12 }}
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Receipt size={36} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No invoices found</div>
            <button className="btn btn-primary" onClick={() => setModal('new')}>
              <Plus size={14} /> New Invoice
            </button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Date</th>
                <th>Due</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(b => (
                <tr key={b.id}>
                  <td className="td-mono" style={{ fontWeight: 600 }}>{b.number}</td>
                  <td style={{ fontSize: 13, fontWeight: 500 }}>{b.clientName || '—'}</td>
                  <td className="td-mono">{b.date ? fmtDate(b.date + 'T00:00:00') : fmtDate(b.createdAt)}</td>
                  <td className="td-mono" style={{ color: b.status === 'overdue' ? 'var(--red)' : 'var(--text-2)' }}>
                    {b.dueDate ? fmtDate(b.dueDate + 'T00:00:00') : '—'}
                  </td>
                  <td>
                    <span className={`badge ${b.status === 'paid' ? 'badge-green' : b.status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>
                      {STATUS_ICONS[b.status]} {b.status}
                    </span>
                  </td>
                  <td className="td-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {fmt(b.total, settings.currency)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" title="Print Invoice"
                        onClick={() => printInvoice(b, settings, clients)}>
                        <Printer size={14} />
                      </button>
                      {b.status !== 'paid' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setPayModal(b)}>
                          <CheckCircle size={12} /> Paid
                        </button>
                      )}
                      {b.status === 'unpaid' && (
                        <button className="icon-btn" onClick={() => updateBill(b.id, { status: 'overdue' })} title="Mark overdue">
                          <AlertTriangle size={13} />
                        </button>
                      )}
                      <button className="icon-btn" onClick={() => setModal(b)}><Pencil size={14} /></button>
                      <button className="icon-btn" onClick={() => deleteBill(b.id)} style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <BillModal
          bill={modal === 'new' ? null : modal}
          clients={clients}
          bills={bills}
          accounts={accounts}
          taxRate={settings.taxScheme === 'percentage' ? (settings.percentageTaxRate ?? 3) : (settings.vatRate ?? 12)}
          taxLabel={settings.taxScheme === 'percentage' ? 'Percentage Tax' : 'VAT'}
          onClose={() => setModal(null)}
          onSave={form => {
            if (modal === 'new') addBill(form)
            else updateBill(modal.id, form)
            setModal(null)
          }}
        />
      )}

      {payModal && (
        <MarkPaidModal
          bill={payModal}
          cashAccounts={cashAccounts}
          onClose={() => setPayModal(null)}
          onConfirm={({ paidDate, cashAccount }) => {
            updateBill(payModal.id, { status: 'paid', paidDate, cashAccount })
            setPayModal(null)
          }}
        />
      )}
    </div>
  )
}
