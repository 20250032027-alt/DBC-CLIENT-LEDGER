import { useState } from 'react'
import { useStore } from '../store/useStore.jsx'
import { supabase } from '../lib/supabase'
import { Save, LogOut, Cloud } from 'lucide-react'

export default function Settings({ userEmail }) {
  const { settings, updateSettings, deleteAllData } = useStore()
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

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
