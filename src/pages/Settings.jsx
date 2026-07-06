import { useState } from 'react'
import { useStore } from '../store/useStore.jsx'
import { supabase } from '../lib/supabase'
import { Save, LogOut, Cloud } from 'lucide-react'

export default function Settings({ userEmail }) {
  const { settings, updateSettings, deleteAllData } = useStore()
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Persists immediately rather than waiting for the "Save Settings" button
  // below — that button lives in a different card, and it was too easy to
  // upload a logo, see the preview, and navigate away thinking it was saved.
  function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const maxW = 320
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/png')
        const updated = { ...form, logo: dataUrl }
        setForm(updated)
        updateSettings(updated)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
    e.target.value = '' // allow re-selecting the same file later
  }

  function removeLogo() {
    const updated = { ...form, logo: '' }
    setForm(updated)
    updateSettings(updated)
  }

  function save() {
    updateSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page-content" style={{ maxWidth: 600 }}>
      <div className="page-header">
        <div>
          <div className="page-h1">Settings</div>
          <div className="page-sub">Company info and preferences</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Company Details</div>
        </div>
        <div className="form-grid">
          <div className="form-group form-col-full">
            <label className="form-label">Company Name</label>
            <input className="form-input" value={form.company} onChange={e => setF('company', e.target.value)} />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Address / Contact Info <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(shown on printed invoices)</span></label>
            <textarea className="form-textarea" rows={3} value={form.address || ''}
              onChange={e => setF('address', e.target.value)}
              placeholder="123 Main St, Cagayan de Oro City&#10;Tel: 0912-345-6789 · info@yourfirm.com" />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Business Logo <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(shown on printed vouchers &amp; invoices)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {form.logo ? (
                <img src={form.logo} alt="Logo" style={{ height: 44, maxWidth: 140, objectFit: 'contain', background: 'var(--surface2)', borderRadius: 6, padding: 4, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ height: 44, width: 100, background: 'var(--surface2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                  No logo
                </div>
              )}
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                Upload
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
              </label>
              {form.logo && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={removeLogo}>Remove</button>
              )}
              {saved && <span style={{ fontSize: 11, color: 'var(--green)' }}>Saved</span>}
            </div>
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">TIN <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(your business's, shown on printed invoices)</span></label>
            <input className="form-input" value={form.tin || ''} onChange={e => setF('tin', e.target.value)} placeholder="000-000-000-000" />
          </div>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <select className="form-select" value={form.currency} onChange={e => setF('currency', e.target.value)}>
              <option value="PHP">PHP — Philippine Peso</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="SGD">SGD — Singapore Dollar</option>
              <option value="JPY">JPY — Japanese Yen</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div className="card-title">Tax Scheme (BIR)</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
          A business is registered with the BIR as either VAT or Non-VAT (Percentage Tax) —
          this is set here at the company level and applies to every Sales voucher. It isn't
          something you switch per transaction.
        </div>
        <div className="form-grid">
          <div className="form-group form-col-full">
            <label className="form-label">Registration Type</label>
            <select className="form-select" value={form.taxScheme || 'vat'} onChange={e => setF('taxScheme', e.target.value)}>
              <option value="vat">VAT-registered</option>
              <option value="percentage">Non-VAT — Percentage Tax</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">VAT Rate (%)</label>
            <input className="form-input" type="number" min="0" max="100" step="0.5"
              disabled={form.taxScheme === 'percentage'}
              value={form.vatRate} onChange={e => setF('vatRate', parseFloat(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Percentage Tax Rate (%)</label>
            <input className="form-input" type="number" min="0" max="100" step="0.5"
              disabled={form.taxScheme === 'vat'}
              value={form.percentageTaxRate} onChange={e => setF('percentageTaxRate', parseFloat(e.target.value))} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
          Whichever isn't active is kept here so switching registration types later doesn't lose the rate.
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save}>
            <Save size={14} />
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Account</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cloud size={14} /> Signed in as <strong style={{ color: 'var(--text-1)' }}>{userEmail}</strong>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>
          <LogOut size={14} /> Sign Out
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Data</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
          Your data is synced to your Supabase cloud database, so it's backed up and
          available from any device you sign into.
        </div>
        <button className="btn btn-danger btn-sm" onClick={() => {
          if (confirm('Delete all accounts, clients, vouchers and invoices? This cannot be undone.')) {
            deleteAllData()
          }
        }}>
          Delete All My Data
        </button>
      </div>
    </div>
  )
}
