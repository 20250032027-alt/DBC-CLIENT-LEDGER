import { useState, useMemo, Fragment } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, verifySecret } from '../utils'
import { Plus, X, Pencil, Trash2, Search, ChevronDown, ChevronRight, Lock } from 'lucide-react'

const CHANNELS = ['Shopee', 'Direct', 'Export', 'Other']
const PAYMENT_TYPES = ['Cash', 'Credit']

function today() { return new Date().toISOString().slice(0, 10) }
function emptyLine() { return { productId: '', quantity: '', amount: '' } }

// Trim + title-case, so "ororama" and "ORORAMA" collapse to the same
// client for search/autocomplete purposes — same normalization the
// original app used.
function normalizeClient(name) {
  if (!name) return ''
  return name.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function InvoiceModal({ invoice, items, products, knownClients, onClose, onSave }) {
  const [form, setForm] = useState(invoice
    ? { referenceNo: invoice.referenceNo || '', client: invoice.client || '', date: invoice.date, channel: invoice.channel, paymentType: invoice.paymentType, notes: invoice.notes || '' }
    : { referenceNo: '', client: '', date: today(), channel: 'Direct', paymentType: 'Cash', notes: '' })
  const [lines, setLines] = useState(items && items.length ? items.map(it => ({
    productId: it.productId, quantity: String(it.quantity), amount: it.amount != null ? String(it.amount) : '',
  })) : [emptyLine()])
  const [error, setError] = useState('')

  function addLine() { setLines(l => [...l, emptyLine()]) }
  function removeLine(i) { setLines(l => l.filter((_, idx) => idx !== i)) }
  function updateLine(i, field, value) { setLines(l => l.map((row, idx) => idx === i ? { ...row, [field]: value } : row)) }

  function effectiveAmount(line) {
    if (line.amount !== '' && !isNaN(line.amount)) return Number(line.amount)
    const prod = products.find(p => p.id === line.productId)
    if (prod?.unitPrice && line.quantity && !isNaN(line.quantity)) return Number(line.quantity) * Number(prod.unitPrice)
    return 0
  }
  const total = lines.reduce((s, l) => s + effectiveAmount(l), 0)

  function submit() {
    if (lines.length === 0) { setError('Add at least one product.'); return }
    for (const l of lines) {
      if (!l.productId) { setError('Select a product for each line.'); return }
      if (!l.quantity || isNaN(l.quantity) || Number(l.quantity) <= 0) { setError('Enter a valid quantity for each line.'); return }
      if (l.amount !== '' && (isNaN(l.amount) || Number(l.amount) < 0)) { setError('Enter a valid amount for each line.'); return }
    }
    onSave(
      { ...form, referenceNo: form.referenceNo.trim() || null, client: normalizeClient(form.client) || null, notes: form.notes.trim() || null },
      lines.map(l => ({ productId: l.productId, quantity: Number(l.quantity), amount: l.amount !== '' && !isNaN(l.amount) ? Number(l.amount) : null }))
    )
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <span className="modal-title">{invoice ? 'Edit Invoice' : 'New Invoice'}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Reference No.</label>
            <input className="form-input" value={form.referenceNo} onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Client</label>
            <input className="form-input" list="dbc-known-clients" value={form.client}
              onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="Optional" />
            <datalist id="dbc-known-clients">
              {knownClients.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Channel</label>
            <select className="form-select" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Payment Type *</label>
            <select className="form-select" value={form.paymentType} onChange={e => setForm(f => ({ ...f, paymentType: e.target.value }))}>
              {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 8, marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Line Items</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.map((line, idx) => {
            const prod = products.find(p => p.id === line.productId)
            return (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                  {idx === 0 && <label className="form-label">Product</label>}
                  <select className="form-select" value={line.productId} onChange={e => updateLine(idx, 'productId', e.target.value)}>
                    <option value="">Select...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  {idx === 0 && <label className="form-label">Qty</label>}
                  <input className="form-input" type="number" min="0.01" step="any" value={line.quantity}
                    onChange={e => updateLine(idx, 'quantity', e.target.value)} placeholder="0" />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  {idx === 0 && <label className="form-label">Amount</label>}
                  <input className="form-input" type="number" min="0" step="0.01" value={line.amount}
                    onChange={e => updateLine(idx, 'amount', e.target.value)}
                    placeholder={prod?.unitPrice ? `auto: ${fmt(Number(line.quantity || 0) * prod.unitPrice)}` : '0.00'} />
                </div>
                <button type="button" className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => removeLine(idx)}><Trash2 size={15} /></button>
              </div>
            )
          })}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addLine}>
          <Plus size={14} /> Add Product
        </button>

        <div className="form-group form-col-full" style={{ marginTop: 12 }}>
          <label className="form-label">Notes</label>
          <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 14, fontWeight: 700, marginTop: 10 }}>
          Total: {fmt(total)}
        </div>

        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Save</button>
        </div>
      </div>
    </div>
  )
}

function EditDeletePasswordModal({ settings, onClose, onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const requiresPassword = !!settings?.deletePasswordHash

  async function confirm() {
    if (requiresPassword && !(await verifySecret(password, settings.pwSalt, settings.deletePasswordHash))) {
      setError('Incorrect password.')
      return
    }
    onSuccess()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 360 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Lock size={15} /> Confirm</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {requiresPassword ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
              Editing or deleting an invoice needs the deletion password (Settings &gt; Data).
            </div>
            <input autoFocus type="password" className="form-input" value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && confirm()} placeholder="Password" />
            {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No deletion password is set (Settings &gt; Data), so this will proceed without one.</div>
        )}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm}>Continue</button>
        </div>
      </div>
    </div>
  )
}

export default function Sales() {
  const {
    invoices, invoiceItems, products, settings,
    addSalesInvoice, updateSalesInvoice, deleteSalesInvoice,
  } = useStore()

  const [search, setSearch] = useState('')
  const [filterPayment, setFilterPayment] = useState('all')
  const [expanded, setExpanded] = useState(new Set())
  const [formModal, setFormModal] = useState(null) // null | 'new' | invoice
  const [gate, setGate] = useState(null) // null | { action: 'edit'|'delete', invoice }

  const itemsByInvoice = useMemo(() => {
    const map = {}
    invoiceItems.forEach(it => { (map[it.invoiceId] = map[it.invoiceId] || []).push(it) })
    return map
  }, [invoiceItems])

  const knownClients = useMemo(() => {
    const seen = new Map()
    invoices.forEach(i => { if (i.client) seen.set(i.client.toLowerCase(), i.client) })
    return [...seen.values()].sort()
  }, [invoices])

  function productName(id) { return products.find(p => p.id === id)?.name || '(deleted product)' }
  function productUnit(id) { return products.find(p => p.id === id)?.unit || '' }
  function itemRevenue(it) {
    if (it.amount != null) return Number(it.amount)
    const prod = products.find(p => p.id === it.productId)
    return prod?.unitPrice ? Number(it.quantity) * Number(prod.unitPrice) : 0
  }
  function invoiceRevenue(inv) { return (itemsByInvoice[inv.id] || []).reduce((s, it) => s + itemRevenue(it), 0) }
  function invoiceSummary(inv) {
    const items = itemsByInvoice[inv.id] || []
    if (items.length === 0) return '—'
    if (items.length === 1) return `${Number(items[0].quantity).toLocaleString()} ${productUnit(items[0].productId)} ${productName(items[0].productId)}`
    return `${items.length} products`
  }

  const filtered = useMemo(() => {
    let rows = invoices
    if (filterPayment !== 'all') rows = rows.filter(i => i.paymentType === filterPayment)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(i =>
        (i.client || '').toLowerCase().includes(q) ||
        (i.referenceNo || '').toLowerCase().includes(q) ||
        (itemsByInvoice[i.id] || []).some(it => productName(it.productId).toLowerCase().includes(q)))
    }
    return [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [invoices, search, filterPayment, itemsByInvoice])

  const totalRevenue = filtered.reduce((s, inv) => s + invoiceRevenue(inv), 0)
  const cashRevenue = filtered.filter(i => i.paymentType === 'Cash').reduce((s, inv) => s + invoiceRevenue(inv), 0)
  const creditRevenue = filtered.filter(i => i.paymentType === 'Credit').reduce((s, inv) => s + invoiceRevenue(inv), 0)

  function toggleExpand(id) {
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function handleFormSave(form, items) {
    if (formModal === 'new') addSalesInvoice(form, items)
    else updateSalesInvoice(formModal.id, form, items)
    setFormModal(null)
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Sales</div>
          <div className="page-sub">Record multi-product invoices — each one posts straight to your books</div>
        </div>
        <button className="btn btn-primary" onClick={() => setFormModal('new')} disabled={products.length === 0}>
          <Plus size={14} /> New Invoice
        </button>
      </div>

      {products.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '24px 0', textAlign: 'center' }}>
          No products yet — add some on the Product Assembly page first.
        </div>
      )}

      {products.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Revenue', value: totalRevenue },
              { label: 'Cash', value: cashRevenue },
              { label: 'Credit (unpaid)', value: creditRevenue },
            ].map(c => (
              <div key={c.label} className="card" style={{ flex: '1 1 160px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(c.value, settings.currency)}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 200px' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search client, reference, or product..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="form-select" style={{ width: 'auto' }} value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
                <option value="all">All Payment Types</option>
                {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {filtered.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '16px 0', textAlign: 'center' }}>
                {invoices.length === 0 ? 'No invoices yet.' : 'No results match your search.'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border2)' }}>
                    {['', 'Date', 'Client', 'Reference', 'Items', 'Payment', 'Revenue', ''].map(h => (
                      <th key={h} style={{ textAlign: h === 'Revenue' ? 'right' : 'left', padding: '8px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => (
                    <Fragment key={inv.id}>
                      <tr style={{ borderBottom: expanded.has(inv.id) ? 'none' : '1px solid var(--border)' }}>
                        <td style={{ padding: '8px' }}>
                          <button className="icon-btn" onClick={() => toggleExpand(inv.id)}>
                            {expanded.has(inv.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{inv.date}</td>
                        <td style={{ padding: '8px' }}>{inv.client || '—'}</td>
                        <td style={{ padding: '8px', color: 'var(--text-3)' }}>{inv.referenceNo || '—'}</td>
                        <td style={{ padding: '8px', color: 'var(--text-3)' }}>{invoiceSummary(inv)}</td>
                        <td style={{ padding: '8px' }}>
                          <span className={inv.paymentType === 'Cash' ? 'badge badge-green' : 'badge badge-amber'}>{inv.paymentType}</span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(invoiceRevenue(inv), settings.currency)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <button className="icon-btn" onClick={() => setGate({ action: 'edit', invoice: inv })}><Pencil size={14} /></button>
                          <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => setGate({ action: 'delete', invoice: inv })}><Trash2 size={14} /></button>
                        </td>
                      </tr>
                      {expanded.has(inv.id) && (
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <td></td>
                          <td colSpan={7} style={{ padding: '0 8px 10px' }}>
                            <table style={{ width: '100%', fontSize: 12, color: 'var(--text-3)' }}>
                              <tbody>
                                {(itemsByInvoice[inv.id] || []).map(it => (
                                  <tr key={it.id}>
                                    <td style={{ padding: '3px 0' }}>{productName(it.productId)}</td>
                                    <td style={{ padding: '3px 0' }}>{Number(it.quantity).toLocaleString()} {productUnit(it.productId)}</td>
                                    <td style={{ padding: '3px 0', textAlign: 'right' }}>{fmt(itemRevenue(it), settings.currency)}</td>
                                  </tr>
                                ))}
                                {inv.notes && <tr><td colSpan={3} style={{ padding: '4px 0', fontStyle: 'italic' }}>Note: {inv.notes}</td></tr>}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {formModal && (
        <InvoiceModal
          invoice={formModal === 'new' ? null : formModal}
          items={formModal === 'new' ? null : (itemsByInvoice[formModal.id] || [])}
          products={products}
          knownClients={knownClients}
          onClose={() => setFormModal(null)}
          onSave={handleFormSave}
        />
      )}

      {gate && (
        <EditDeletePasswordModal
          settings={settings}
          onClose={() => setGate(null)}
          onSuccess={() => {
            const { action, invoice } = gate
            setGate(null)
            if (action === 'edit') setFormModal(invoice)
            else if (confirm('Delete this invoice? This cannot be undone.')) deleteSalesInvoice(invoice.id)
          }}
        />
      )}
    </div>
  )
}
