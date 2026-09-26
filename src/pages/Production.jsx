import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { verifySecret } from '../utils'
import { Plus, X, Pencil, Trash2, Search, Lock, SlidersHorizontal } from 'lucide-react'

function today() { return new Date().toISOString().slice(0, 10) }

function ProductionFormModal({ entry, products, title, subtitle, allowNegative, onClose, onSave }) {
  const [form, setForm] = useState(entry
    ? { productId: entry.productId, quantity: String(entry.quantity), date: entry.date, batchNotes: entry.batchNotes || '' }
    : { productId: products[0]?.id || '', quantity: '', date: today(), batchNotes: '' })
  const [error, setError] = useState('')

  function submit() {
    if (!form.productId) { setError('Select a product.'); return }
    const q = parseFloat(form.quantity)
    if (form.quantity === '' || isNaN(q) || (!allowNegative && q <= 0) || (allowNegative && q === 0)) {
      setError(allowNegative ? 'Enter a non-zero quantity.' : 'Enter a valid quantity.')
      return
    }
    onSave({ productId: form.productId, quantity: q, date: form.date, batchNotes: form.batchNotes.trim() || null })
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="form-grid">
          <div className="form-group form-col-full">
            <label className="form-label">Product *</label>
            <select className="form-select" value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Quantity *</label>
            <input autoFocus className="form-input" type="number" step="any" value={form.quantity}
              onChange={e => { setForm(f => ({ ...f, quantity: e.target.value })); setError('') }}
              placeholder={allowNegative ? 'e.g. -5 or 5' : '0'} />
          </div>
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">{allowNegative ? 'Reason / Notes' : 'Batch Notes'}</label>
            <input className="form-input" value={form.batchNotes} onChange={e => setForm(f => ({ ...f, batchNotes: e.target.value }))}
              placeholder={allowNegative ? 'e.g. Physical count correction' : 'Optional notes about this batch'} />
          </div>
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

// Same reasoning as Raw Materials: the original app's hardcoded '1234' PIN
// is replaced with the real, hashed deletion password already used
// elsewhere in Settings.
function AdjustmentPasswordModal({ settings, onClose, onSuccess }) {
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
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Lock size={15} /> Adjustment</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {requiresPassword ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
              Manual production corrections need the deletion password (Settings &gt; Data) to continue.
            </div>
            <input
              autoFocus type="password" className="form-input" value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              placeholder="Password"
            />
            {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            No deletion password is set (Settings &gt; Data), so this will proceed without one.
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm}>Continue</button>
        </div>
      </div>
    </div>
  )
}

export default function Production() {
  const {
    products, productionEntries, assemblyItems, rawMaterials, rawMaterialEntries, settings,
    addProductionEntry, updateProductionEntry, deleteProductionEntry,
  } = useStore()

  const [search, setSearch] = useState('')
  const [filterProduct, setFilterProduct] = useState('all')
  const [formModal, setFormModal] = useState(null) // null | 'new' | entry
  const [adjustGate, setAdjustGate] = useState(false)
  const [adjustModal, setAdjustModal] = useState(false)

  // Current raw material stock — same calculation as the Raw Materials
  // page — needed here to warn (not block) if a production run would
  // take a material below zero.
  const rawStock = useMemo(() => {
    const stock = {}
    rawMaterials.forEach(m => { stock[m.id] = Number(m.openingStock) || 0 })
    rawMaterialEntries.forEach(e => { stock[e.rawMaterialId] = (stock[e.rawMaterialId] ?? 0) + Number(e.quantity) })
    return stock
  }, [rawMaterials, rawMaterialEntries])

  const { runningBalanceByEntry, currentBalanceByProduct } = useMemo(() => {
    const chronological = [...productionEntries].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''))
    const byEntry = {}
    const running = {}
    chronological.forEach(e => {
      running[e.productId] = (running[e.productId] || 0) + Number(e.quantity)
      byEntry[e.id] = running[e.productId]
    })
    return { runningBalanceByEntry: byEntry, currentBalanceByProduct: running }
  }, [productionEntries])

  const filtered = useMemo(() => {
    let rows = productionEntries
    if (filterProduct !== 'all') rows = rows.filter(e => e.productId === filterProduct)
    if (search.trim()) {
      const q = search.toLowerCase()
      const productName = id => (products.find(p => p.id === id)?.name || '').toLowerCase()
      rows = rows.filter(e => productName(e.productId).includes(q) || (e.batchNotes || '').toLowerCase().includes(q))
    }
    return [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [productionEntries, products, search, filterProduct])

  function productName(id) { return products.find(p => p.id === id)?.name || '(deleted product)' }
  function productUnit(id) { return products.find(p => p.id === id)?.unit || '' }

  // Warn, don't block, if this run would take any raw material negative —
  // same behavior as the original app. When editing an existing entry
  // (excludeEntryId set), rawStock still reflects THIS entry's own old
  // consumption — without correcting for that, reducing a batch's
  // quantity could incorrectly show a false shortage warning, since the
  // check would be comparing against a balance already reduced by the
  // very entry being edited.
  function confirmStockIfShort(productId, quantity, excludeEntryId) {
    const recipe = assemblyItems.filter(a => a.productId === productId)
    if (recipe.length === 0) return true
    const shortages = []
    recipe.forEach(r => {
      const need = Number(r.quantityPerUnit) * Number(quantity)
      let have = rawStock[r.rawMaterialId] ?? 0
      if (excludeEntryId) {
        const oldConsumed = rawMaterialEntries
          .filter(e => e.productionEntryId === excludeEntryId && e.rawMaterialId === r.rawMaterialId)
          .reduce((s, e) => s + Number(e.quantity), 0) // negative — consumption is stored as negative quantity
        have -= oldConsumed // subtracting a negative adds it back
      }
      if (need > have) {
        const mat = rawMaterials.find(m => m.id === r.rawMaterialId)
        shortages.push(`${mat?.name || 'Material'}: need ${need.toLocaleString()} ${mat?.unit || ''}, have ${have.toLocaleString()} ${mat?.unit || ''}`)
      }
    })
    if (shortages.length === 0) return true
    return confirm(`This batch needs more raw material than is currently in stock:\n\n${shortages.join('\n')}\n\nSave anyway? Raw material stock will go negative.`)
  }

  function handleFormSave(form) {
    const excludeEntryId = formModal !== 'new' ? formModal.id : null
    if (!confirmStockIfShort(form.productId, form.quantity, excludeEntryId)) return
    if (formModal === 'new') addProductionEntry(form)
    else updateProductionEntry(formModal.id, form)
    setFormModal(null)
  }
  function handleDelete(e) {
    if (!confirm('Remove this production entry? Any raw material it consumed will be added back to stock.')) return
    deleteProductionEntry(e.id)
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Production</div>
          <div className="page-sub">Log production batches — raw materials are consumed automatically per each product's recipe</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setAdjustGate(true)} disabled={products.length === 0}>
            <SlidersHorizontal size={14} /> Adjustment
          </button>
          <button className="btn btn-primary" onClick={() => setFormModal('new')} disabled={products.length === 0}>
            <Plus size={14} /> Log Production
          </button>
        </div>
      </div>

      {products.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '24px 0', textAlign: 'center' }}>
          No products yet — add some on the Product Assembly page first.
        </div>
      )}

      {products.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search product or batch notes..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 'auto' }} value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
              <option value="all">All Products</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {filterProduct !== 'all' && (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                Running balance: <strong style={{ color: 'var(--text-1)' }}>{Number(currentBalanceByProduct[filterProduct] || 0).toLocaleString()} {products.find(p => p.id === filterProduct)?.unit}</strong>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '16px 0', textAlign: 'center' }}>
              {productionEntries.length === 0 ? 'No production entries yet.' : 'No results match your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border2)' }}>
                  {['Date', 'Product', 'Quantity', 'Type', 'Running Balance', 'Batch Notes', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{e.date}</td>
                    <td style={{ padding: '8px' }}>{productName(e.productId)}</td>
                    <td style={{ padding: '8px', fontFamily: 'var(--mono)', color: e.isAdjustment && Number(e.quantity) < 0 ? 'var(--red)' : undefined }}>
                      {Number(e.quantity) > 0 ? '+' : ''}{Number(e.quantity).toLocaleString()} {productUnit(e.productId)}
                    </td>
                    <td style={{ padding: '8px' }}>
                      {e.isAdjustment ? <span className="badge badge-blue">Adjustment</span> : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Production</span>}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{Number(runningBalanceByEntry[e.id] ?? 0).toLocaleString()} {productUnit(e.productId)}</td>
                    <td style={{ padding: '8px', color: 'var(--text-3)' }}>{e.batchNotes || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <button className="icon-btn" onClick={() => setFormModal(e)}><Pencil size={14} /></button>
                      <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => handleDelete(e)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {formModal && (
        <ProductionFormModal
          entry={formModal === 'new' ? null : formModal}
          products={products}
          title={formModal === 'new' ? 'Log Production' : 'Edit Production Entry'}
          onClose={() => setFormModal(null)}
          onSave={handleFormSave}
        />
      )}

      {adjustGate && (
        <AdjustmentPasswordModal
          settings={settings}
          onClose={() => setAdjustGate(false)}
          onSuccess={() => { setAdjustGate(false); setAdjustModal(true) }}
        />
      )}

      {adjustModal && (
        <ProductionFormModal
          products={products}
          title="Adjustment Entry"
          subtitle="Manual stock correction. Positive to add stock, negative to remove it."
          allowNegative
          onClose={() => setAdjustModal(false)}
          onSave={form => {
            addProductionEntry({ ...form, isAdjustment: true })
            setAdjustModal(false)
          }}
        />
      )}
    </div>
  )
}
