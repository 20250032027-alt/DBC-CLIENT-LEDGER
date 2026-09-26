import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt } from '../utils'
import { Plus, X, Pencil, Trash2, Search, Layers } from 'lucide-react'
import { showToast } from '../lib/toast'

const UNITS = ['pc', 'pack', 'box', 'bottle', 'sachet', 'bag', 'tray', 'can', 'jar', 'pouch', 'kg', 'g', 'ml', 'L']

function ProductModal({ product, onClose, onSave }) {
  const [form, setForm] = useState(product
    ? { name: product.name, unit: product.unit, unitPrice: product.unitPrice ?? '', openingStock: product.openingStock ?? '', description: product.description || '' }
    : { name: '', unit: 'pc', unitPrice: '', openingStock: '', description: '' })
  const [error, setError] = useState('')

  function submit() {
    if (!form.name.trim()) { setError('Product name is required.'); return }
    onSave({
      name: form.name.trim(),
      unit: form.unit,
      unitPrice: form.unitPrice !== '' ? parseFloat(form.unitPrice) : null,
      openingStock: form.openingStock !== '' ? parseFloat(form.openingStock) : 0,
      description: form.description.trim() || null,
    })
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <span className="modal-title">{product ? 'Edit Product' : 'New Product'}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="form-grid">
          <div className="form-group form-col-full">
            <label className="form-label">Product Name *</label>
            <input autoFocus className="form-input" value={form.name}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError('') }}
              placeholder="e.g. Coco Sugar 200g" />
          </div>
          <div className="form-group">
            <label className="form-label">Unit *</label>
            <select className="form-select" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Unit Price</label>
            <input className="form-input" type="number" min="0" step="0.01" value={form.unitPrice}
              onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Opening Stock</label>
            <input className="form-input" type="number" min="0" step="any" value={form.openingStock}
              onChange={e => setForm(f => ({ ...f, openingStock: e.target.value }))}
              placeholder="Stock on hand before using this system" />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes" />
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

function ProductsTab() {
  const { products, addProduct, updateProduct, deleteProduct, settings } = useStore()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)

  const filtered = products.filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()))

  function handleSave(form) {
    if (modal === 'new') addProduct(form)
    else updateProduct(modal.id, form)
    setModal(null)
  }
  function handleDelete(p) {
    if (!confirm(`Delete "${p.name}"? This also removes it from any assembly recipes using it.`)) return
    deleteProduct(p.id)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search products..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}><Plus size={14} /> Add Product</button>
      </div>

      {products.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '24px 0', textAlign: 'center' }}>
          No products yet — add your first one to get started.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border2)' }}>
              {['Name', 'Unit', 'Price', 'Opening Stock', 'Description', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px', fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: '8px' }}><span className="badge badge-gray">{p.unit}</span></td>
                <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{p.unitPrice != null ? fmt(p.unitPrice, settings.currency) : '—'}</td>
                <td style={{ padding: '8px', fontFamily: 'var(--mono)' }}>{p.openingStock > 0 ? `${Number(p.openingStock).toLocaleString()} ${p.unit}` : '—'}</td>
                <td style={{ padding: '8px', color: 'var(--text-3)' }}>{p.description || '—'}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>
                  <button className="icon-btn" onClick={() => setModal(p)}><Pencil size={14} /></button>
                  <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => handleDelete(p)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <ProductModal product={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSave={handleSave} />
      )}
    </div>
  )
}

function RecipeModal({ product, materials, existingRows, onClose, onSave }) {
  const [rows, setRows] = useState(existingRows.length
    ? existingRows.map(r => ({ rawMaterialId: r.rawMaterialId, quantityPerUnit: String(r.quantityPerUnit) }))
    : [{ rawMaterialId: materials[0]?.id || '', quantityPerUnit: '' }])
  const [error, setError] = useState('')

  function addRow() {
    const unused = materials.find(m => !rows.some(r => r.rawMaterialId === m.id))
    setRows(r => [...r, { rawMaterialId: unused?.id || '', quantityPerUnit: '' }])
  }
  function removeRow(idx) { setRows(r => r.filter((_, i) => i !== idx)) }
  function updateRow(idx, field, value) { setRows(r => r.map((row, i) => i === idx ? { ...row, [field]: value } : row)) }

  function submit() {
    const clean = rows.filter(r => r.rawMaterialId && r.quantityPerUnit !== '')
    if (clean.some(r => isNaN(r.quantityPerUnit) || parseFloat(r.quantityPerUnit) <= 0)) {
      setError('Each quantity must be a positive number.')
      return
    }
    const ids = clean.map(r => r.rawMaterialId)
    if (new Set(ids).size !== ids.length) {
      setError('Each raw material can only appear once in a recipe.')
      return
    }
    onSave(clean.map(r => ({ rawMaterialId: r.rawMaterialId, quantityPerUnit: parseFloat(r.quantityPerUnit) })))
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Recipe: {product.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Raw materials needed to produce 1 {product.unit} of {product.name}.</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {materials.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--red)' }}>No raw materials exist yet — add some on the Raw Materials page first.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((row, idx) => {
              const mat = materials.find(m => m.id === row.rawMaterialId)
              return (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                    <label className="form-label">Raw Material</label>
                    <select className="form-select" value={row.rawMaterialId} onChange={e => updateRow(idx, 'rawMaterialId', e.target.value)}>
                      <option value="">Select...</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label">Qty per unit {mat ? `(${mat.unit})` : ''}</label>
                    <input className="form-input" type="number" min="0.001" step="any" value={row.quantityPerUnit}
                      onChange={e => updateRow(idx, 'quantityPerUnit', e.target.value)} placeholder="0" />
                  </div>
                  <button type="button" className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => removeRow(idx)}><Trash2 size={15} /></button>
                </div>
              )
            })}
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addRow}>
              <Plus size={14} /> Add Ingredient
            </button>
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={materials.length === 0}>Save Recipe</button>
        </div>
      </div>
    </div>
  )
}

function RecipesTab() {
  const { products, rawMaterials, assemblyItems, saveAssemblyRecipe } = useStore()
  const [search, setSearch] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)

  const itemsByProduct = useMemo(() => {
    const map = {}
    assemblyItems.forEach(it => {
      if (!map[it.productId]) map[it.productId] = []
      map[it.productId].push(it)
    })
    return map
  }, [assemblyItems])

  const materialName = id => rawMaterials.find(m => m.id === id)?.name || '(deleted material)'
  const materialUnit = id => rawMaterials.find(m => m.id === id)?.unit || ''

  const filtered = products.filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()))

  async function handleSaveRecipe(rows) {
    await saveAssemblyRecipe(editingProduct.id, rows)
    setEditingProduct(null)
    showToast('Assembly recipe saved.', 'synced')
  }

  if (products.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '24px 0', textAlign: 'center' }}>
        No products yet — add some on the Products tab first, then come back here to set their recipes.
      </div>
    )
  }

  return (
    <div>
      {rawMaterials.length === 0 && (
        <div style={{
          fontSize: 12.5, color: 'var(--amber)', background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 14,
        }}>
          Add raw materials first (Raw Materials page) before building a recipe here.
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 12, maxWidth: 320 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
        <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search products..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border2)' }}>
            {['Product', 'Recipe', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(p => {
            const recipe = itemsByProduct[p.id] || []
            return (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px', fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: '8px', color: 'var(--text-3)' }}>
                  {recipe.length === 0 ? 'No recipe set' : recipe.map(it => `${Number(it.quantityPerUnit).toLocaleString()} ${materialUnit(it.rawMaterialId)} ${materialName(it.rawMaterialId)}`).join(', ')}
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingProduct(p)}>
                    <Layers size={14} /> {recipe.length ? 'Edit Recipe' : 'Set Recipe'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {editingProduct && (
        <RecipeModal
          product={editingProduct}
          materials={rawMaterials}
          existingRows={itemsByProduct[editingProduct.id] || []}
          onClose={() => setEditingProduct(null)}
          onSave={handleSaveRecipe}
        />
      )}
    </div>
  )
}

export default function Assembly() {
  const [tab, setTab] = useState('products')

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Product Assembly</div>
          <div className="page-sub">Manage your product catalog and define the recipe (bill of materials) for each one</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12.5, padding: '8px 16px', background: tab === 'products' ? 'var(--accent)' : undefined, color: tab === 'products' ? '#fff' : undefined }}
          onClick={() => setTab('products')}
        >
          Products
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12.5, padding: '8px 16px', background: tab === 'recipes' ? 'var(--accent)' : undefined, color: tab === 'recipes' ? '#fff' : undefined }}
          onClick={() => setTab('recipes')}
        >
          Recipes
        </button>
      </div>

      {tab === 'products' ? <ProductsTab /> : <RecipesTab />}
    </div>
  )
}
