import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, verifySecret } from '../utils'
import { Plus, X, Pencil, Trash2, Search, Lock, Loader2 } from 'lucide-react'
import { showToast } from '../lib/toast'

const UNITS = ['kg', 'g', 'L', 'ml', 'pc', 'sack', 'bag', 'box', 'roll', 'bottle', 'pack']

function today() { return new Date().toISOString().slice(0, 10) }

function typeBadge(entryType) {
  if (entryType === 'adjustment') return <span className="badge badge-blue">Adjustment</span>
  if (entryType === 'consumption') return <span className="badge badge-amber">Consumed (Production)</span>
  if (entryType === 'tapper_intake') return <span className="badge badge-blue">Tapper Intake</span>
  return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Intake</span>
}

function MaterialModal({ material, onClose, onSave }) {
  const [form, setForm] = useState(material
    ? { name: material.name, unit: material.unit, unitCost: material.unitCost ?? '', openingStock: material.openingStock ?? '' }
    : { name: '', unit: 'kg', unitCost: '', openingStock: '' })
  const [error, setError] = useState('')

  function submit() {
    if (!form.name.trim()) { setError('Material name is required.'); return }
    onSave({
      name: form.name.trim(),
      unit: form.unit,
      unitCost: form.unitCost !== '' ? parseFloat(form.unitCost) : null,
      openingStock: form.openingStock !== '' ? parseFloat(form.openingStock) : 0,
    })
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <span className="modal-title">{material ? 'Edit Raw Material' : 'New Raw Material'}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="form-grid">
          <div className="form-group form-col-full">
            <label className="form-label">Material Name *</label>
            <input autoFocus className="form-input" value={form.name}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError('') }}
              placeholder="e.g. Coconut Sap" />
          </div>
          <div className="form-group">
            <label className="form-label">Unit *</label>
            <select className="form-select" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Unit Cost</label>
            <input className="form-input" type="number" min="0" step="0.01" value={form.unitCost}
              onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Opening Stock</label>
            <input className="form-input" type="number" min="0" step="any" value={form.openingStock}
              onChange={e => setForm(f => ({ ...f, openingStock: e.target.value }))}
              placeholder="Stock on hand before using this system" />
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

function IntakeModal({ entry, materials, defaultMaterialId, onClose, onSave, title }) {
  const [form, setForm] = useState(entry
    ? { rawMaterialId: entry.rawMaterialId, quantity: String(entry.quantity), date: entry.date, batchNotes: entry.batchNotes || '' }
    : { rawMaterialId: defaultMaterialId || materials[0]?.id || '', quantity: '', date: today(), batchNotes: '' })
  const [error, setError] = useState('')
  const selected = materials.find(m => m.id === form.rawMaterialId)

  function submit() {
    if (!form.rawMaterialId) { setError('Select a raw material.'); return }
    if (!form.quantity || isNaN(form.quantity) || parseFloat(form.quantity) <= 0) { setError('Enter a valid quantity.'); return }
    onSave({ rawMaterialId: form.rawMaterialId, quantity: parseFloat(form.quantity), date: form.date, batchNotes: form.batchNotes.trim() || null })
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <span className="modal-title">{title || (entry ? 'Edit Intake Entry' : 'Log Raw Material Intake')}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="form-grid">
          <div className="form-group form-col-full">
            <label className="form-label">Raw Material *</label>
            <select className="form-select" value={form.rawMaterialId} onChange={e => setForm(f => ({ ...f, rawMaterialId: e.target.value }))}>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Quantity {selected ? `(${selected.unit})` : ''} *</label>
            <input autoFocus className="form-input" type="number" step="any" value={form.quantity}
              onChange={e => { setForm(f => ({ ...f, quantity: e.target.value })); setError('') }}
              placeholder="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Notes</label>
            <input className="form-input" value={form.batchNotes} onChange={e => setForm(f => ({ ...f, batchNotes: e.target.value }))}
              placeholder="Optional — e.g. supplier or delivery receipt no." />
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

// Adjustments can move stock in either direction with no upper limit, so
// they're gated behind the same deletion password already used elsewhere
// in the app (Settings > Data) rather than a separate PIN — one password
// to manage instead of two, and it's a real hashed check instead of a
// hardcoded PIN in the source code.
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
              Manual stock corrections need the deletion password (Settings &gt; Data) to continue.
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

export default function RawMaterials() {
  const {
    rawMaterials, rawMaterialEntries, settings,
    addRawMaterial, updateRawMaterial, deleteRawMaterial,
    addRawMaterialEntry, updateRawMaterialEntry, deleteRawMaterialEntry,
  } = useStore()

  const [search, setSearch] = useState('')
  const [filterMaterial, setFilterMaterial] = useState('all')
  const [materialModal, setMaterialModal] = useState(null) // null | 'new' | material
  const [intakeModal, setIntakeModal] = useState(null) // null | 'new' | entry
  const [adjustGate, setAdjustGate] = useState(false)
  const [adjustModal, setAdjustModal] = useState(false)

  // Current stock = opening_stock + every entry for that material, summed.
  // Computed fresh each render, not stored — the same reasoning as the
  // original app: a separately-stored running total could silently drift
  // from what the entries actually say.
  const currentBalanceByMaterial = useMemo(() => {
    const balances = {}
    rawMaterials.forEach(m => { balances[m.id] = Number(m.openingStock) || 0 })
    ;[...rawMaterialEntries]
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''))
      .forEach(e => { balances[e.rawMaterialId] = (balances[e.rawMaterialId] ?? 0) + Number(e.quantity) })
    return balances
  }, [rawMaterials, rawMaterialEntries])

  const filtered = useMemo(() => {
    let rows = rawMaterialEntries
    if (filterMaterial !== 'all') rows = rows.filter(e => e.rawMaterialId === filterMaterial)
    if (search.trim()) {
      const q = search.toLowerCase()
      const materialName = id => (rawMaterials.find(m => m.id === id)?.name || '').toLowerCase()
      rows = rows.filter(e => materialName(e.rawMaterialId).includes(q) || (e.batchNotes || '').toLowerCase().includes(q))
    }
    return [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [rawMaterialEntries, rawMaterials, search, filterMaterial])

  function materialName(id) { return rawMaterials.find(m => m.id === id)?.name || '(deleted material)' }
  function materialUnit(id) { return rawMaterials.find(m => m.id === id)?.unit || '' }

  function handleMaterialSave(form) {
    if (materialModal === 'new') addRawMaterial(form)
    else updateRawMaterial(materialModal.id, form)
    setMaterialModal(null)
  }
  function handleMaterialDelete(m) {
    if (!confirm(`Delete "${m.name}"? This also removes its stock history and any assembly recipe lines using it.`)) return
    deleteRawMaterial(m.id)
  }

  function handleIntakeSave(form) {
    if (intakeModal === 'new') addRawMaterialEntry({ ...form, entryType: 'intake' })
    else updateRawMaterialEntry(intakeModal.id, form)
    setIntakeModal(null)
  }
  function handleEntryDelete(e) {
    if (e.entryType === 'consumption') return // read-only, created by Production
    if (!confirm('Remove this entry?')) return
    deleteRawMaterialEntry(e.id)
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Raw Materials</div>
          <div className="page-sub">Log intake, view consumption from Production, and track running stock balances</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setAdjustGate(true)}><Lock size={14} /> Adjustment</button>
          <button className="btn btn-ghost" onClick={() => setMaterialModal('new')}><Plus size={14} /> New Material</button>
          <button className="btn btn-primary" onClick={() => setIntakeModal('new')} disabled={rawMaterials.length === 0}>
            <Plus size={14} /> Log Intake
          </button>
        </div>
      </div>

      {rawMaterials.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '24px 0', textAlign: 'center' }}>
          No raw materials yet. Click "New Material" to add your first one.
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Material Catalog</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border2)' }}>
                  {['Material', 'Unit', 'Unit Cost', 'Opening', 'Current Stock', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawMaterials.map(m => {
                  const stock = Number(currentBalanceByMaterial[m.id] ?? m.openingStock ?? 0)
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{m.name}</td>
                      <td style={{ padding: '8px' }}><span className="badge badge-gray">{m.unit}</span></td>
                      <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{m.unitCost != null ? fmt(m.unitCost, settings.currency) : '—'}</td>
                      <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{(Number(m.openingStock) || 0).toLocaleString()} {m.unit}</td>
                      <td style={{ padding: '8px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{stock.toLocaleString()} {m.unit}</td>
                      <td style={{ padding: '8px' }}>
                        {stock < 0 ? <span className="badge badge-red">Oversold</span> : stock < 10 ? <span className="badge badge-amber">Low</span> : <span className="badge badge-green">In Stock</span>}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <button className="icon-btn" onClick={() => setMaterialModal(m)}><Pencil size={14} /></button>
                        <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => handleMaterialDelete(m)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>Stock Movements</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 200px' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search material or notes..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="form-select" style={{ width: 'auto' }} value={filterMaterial} onChange={e => setFilterMaterial(e.target.value)}>
                <option value="all">All Materials</option>
                {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            {filtered.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '16px 0', textAlign: 'center' }}>
                {rawMaterialEntries.length === 0 ? 'No stock movements yet.' : 'No results match your search.'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border2)' }}>
                    {['Date', 'Material', 'Quantity', 'Type', 'Notes', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{e.date}</td>
                      <td style={{ padding: '8px' }}>{materialName(e.rawMaterialId)}</td>
                      <td style={{ padding: '8px', fontFamily: 'var(--mono)', color: Number(e.quantity) < 0 ? 'var(--red)' : undefined }}>
                        {Number(e.quantity) > 0 ? '+' : ''}{Number(e.quantity).toLocaleString()} {materialUnit(e.rawMaterialId)}
                      </td>
                      <td style={{ padding: '8px' }}>{typeBadge(e.entryType)}</td>
                      <td style={{ padding: '8px', color: 'var(--text-3)' }}>{e.batchNotes || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {e.entryType !== 'consumption' && e.entryType !== 'tapper_intake' && (
                          <>
                            <button className="icon-btn" onClick={() => setIntakeModal(e)}><Pencil size={14} /></button>
                            <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => handleEntryDelete(e)}><Trash2 size={14} /></button>
                          </>
                        )}
                        {e.entryType === 'consumption' && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>via Production</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {materialModal && (
        <MaterialModal
          material={materialModal === 'new' ? null : materialModal}
          onClose={() => setMaterialModal(null)}
          onSave={handleMaterialSave}
        />
      )}

      {intakeModal && (
        <IntakeModal
          entry={intakeModal === 'new' ? null : intakeModal}
          materials={rawMaterials}
          onClose={() => setIntakeModal(null)}
          onSave={handleIntakeSave}
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
        <IntakeModal
          title="Adjustment Entry — positive to add stock, negative to remove"
          materials={rawMaterials}
          onClose={() => setAdjustModal(false)}
          onSave={form => {
            if (form.quantity === 0) { showToast('Enter a non-zero quantity.', 'error'); return }
            addRawMaterialEntry({ ...form, entryType: 'adjustment' })
            setAdjustModal(false)
          }}
        />
      )}
    </div>
  )
}
