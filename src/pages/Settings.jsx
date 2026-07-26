import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore.jsx'
import { supabase } from '../lib/supabase'
import { getInstallState, promptInstall } from '../lib/installPrompt'
import { clearLocalDb } from '../lib/db'
import { stopSync } from '../lib/sync'
import { Save, LogOut, Cloud, Smartphone, X, RotateCcw } from 'lucide-react'
import { formatTin, normalizeTin } from '../utils'

export default function Settings({ userEmail }) {
  const { settings, updateSettings, deleteAllData, pending } = useStore()
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [installState, setInstallState] = useState('installed')
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  useEffect(() => {
    setInstallState(getInstallState())
    const onChange = () => setInstallState(getInstallState())
    window.addEventListener('dbc-ledger-install-available', onChange)
    return () => window.removeEventListener('dbc-ledger-install-available', onChange)
  }, [])
  async function handleInstall() {
    if (installState === 'native') await promptInstall()
    else setShowIOSHelp(true)
  }

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
            <input
              className="form-input" value={form.tin || ''}
              onChange={e => setF('tin', formatTin(e.target.value))}
              onBlur={e => setF('tin', normalizeTin(e.target.value))}
              placeholder="000-000-000-00000"
            />
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
        <div className="card-title" style={{ marginBottom: 12 }}>Install App</div>
        {installState === 'installed' ? (
          <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Smartphone size={14} /> DBC Client Ledger is already installed on this device.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
              Install DBC Client Ledger on your phone or computer for quicker access and full offline use.
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleInstall}>
              <Smartphone size={14} /> Install App
            </button>
          </>
        )}

        {showIOSHelp && (
          <div className="modal-backdrop" onClick={() => setShowIOSHelp(false)}>
            <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Add to Home Screen</span>
                <button className="icon-btn" onClick={() => setShowIOSHelp(false)}><X size={18} /></button>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-2)' }}>
                {installState === 'ios' ? (
                  <ol style={{ paddingLeft: 18 }}>
                    <li>Tap the <strong>Share</strong> icon in Safari's toolbar.</li>
                    <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                    <li>Tap <strong>Add</strong> in the top-right corner.</li>
                  </ol>
                ) : (
                  <ol style={{ paddingLeft: 18 }}>
                    <li>Open your browser's menu (usually ⋮ or ≡ in the toolbar).</li>
                    <li>Look for <strong>Add to Home Screen</strong> or <strong>Install app</strong>.</li>
                    <li>Confirm to add it.</li>
                  </ol>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => setShowIOSHelp(false)}>Got it</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Data</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
          Your data is synced to your Supabase cloud database, so it's backed up and
          available from any device you sign into.
        </div>

        <div className="form-group" style={{ marginBottom: 14, maxWidth: 320 }}>
          <label className="form-label">Deletion Password <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
          <input className="form-input" type="password" value={form.deletePassword || ''}
            onChange={e => setF('deletePassword', e.target.value)}
            placeholder="Leave blank to not require one" />
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            If set, deleting a voucher will ask for this password in addition to typing
            the voucher number — an extra check against accidental deletion. This isn't
            encrypted, so treat it as a speed bump rather than real security. Click "Save
            Settings" above to apply changes here.
          </div>
        </div>

        {pending > 0 && (
          <div style={{
            fontSize: 12.5, color: 'var(--amber)', background: 'var(--amber-dim)',
            borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14,
          }}>
            {pending} change{pending !== 1 ? 's' : ''} on this device {pending !== 1 ? "haven't" : "hasn't"} synced to the cloud yet.
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" disabled={resetting} onClick={async () => {
            const warning = pending > 0
              ? `This device has ${pending} unsynced change${pending !== 1 ? 's' : ''} that will be permanently lost if they haven't already reached the cloud. Only do this if sync has been stuck/failing. Continue?`
              : 'Clear this device\'s local offline cache and reload fresh from the cloud? Nothing on the server is affected — only use this if sync is stuck on this specific device.'
            if (!confirm(warning)) return
            setResetting(true)
            stopSync()
            await clearLocalDb()
            window.location.reload()
          }}>
            <RotateCcw size={14} /> {resetting ? 'Resetting…' : 'Reset This Device'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, maxWidth: 480 }}>
            Wipes this device's local offline copy and re-downloads everything fresh from the
            cloud. Use this if sync gets permanently stuck on one specific device (e.g. an old
            error keeps retrying forever) — it doesn't touch your real data on the server, only
            this device's local cache. Other devices are unaffected.
          </div>
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
