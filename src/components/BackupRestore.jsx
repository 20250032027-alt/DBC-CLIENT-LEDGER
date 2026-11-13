import { useRef, useState } from 'react'
import { Download, Upload, X, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useStore } from '../store/useStore.jsx'
import { verifySecret, todayLocal } from '../utils'
import { showToast } from '../lib/toast'
import { BACKUP_TABLES, buildBackupWorkbook, readBackupWorkbook, planRestore } from '../lib/backup'

// Settings → Data: download the whole ledger as one Excel file, and restore
// from one. Restoring always shows a preview first. "Add what's missing" is
// the safe default and never changes existing records; "Replace everything"
// needs the deletion password (if set) and downloads a backup of the
// current data first, so even a replace can be undone.
export default function BackupRestore() {
  const store = useStore()
  const { settings, isDateLocked, restoreBackup } = store
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [restore, setRestore] = useState(null) // { backup, fileName }
  const [mode, setMode] = useState('merge')
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState('')

  const data = () => Object.fromEntries([...BACKUP_TABLES.map(([k]) => [k, store[k] || []]), ['settings', settings]])
  const today = () => todayLocal()
  const safeName = s => (s || 'ledger').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40)

  async function download(label = 'backup') {
    const XLSX = await import('xlsx')
    const { wb, counts } = buildBackupWorkbook(XLSX, data(), { company: settings?.company || '', createdAt: new Date().toISOString() })
    XLSX.writeFile(wb, `DBC-Ledger-${label}-${safeName(settings?.company)}-${today()}.xlsx`)
    return counts
  }

  async function onDownload() {
    setBusy(true)
    try {
      const counts = await download()
      showToast(`Backup downloaded — ${counts.vouchers} vouchers, ${counts.accounts} accounts, ${counts.clients} clients.`, 'success')
    } catch (e) {
      showToast(`Couldn't make the backup: ${e.message}`, 'error')
    } finally { setBusy(false) }
  }

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // so the same file can be picked again
    if (!file) return
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const backup = readBackupWorkbook(XLSX, wb)
      if (!backup.meta) { showToast(backup.errors[0], 'error'); return }
      setRestore({ backup, fileName: file.name }); setMode('merge'); setPassword(''); setConfirmText(''); setError('')
    } catch {
      showToast("That file couldn't be opened. Pick an Excel backup made by this app.", 'error')
    } finally { setBusy(false) }
  }

  const plan = restore ? planRestore(restore.backup, store, mode, { isDateLocked }) : null
  const totalToAdd = plan ? plan.summary.reduce((t, s) => t + s.toAdd, 0) : 0
  const needsPassword = mode === 'replace' && !!settings?.deletePasswordHash
  const ready = plan && (mode === 'merge' ? totalToAdd > 0 : confirmText.trim().toUpperCase() === 'REPLACE' && (!needsPassword || password))

  async function onRestore() {
    if (!ready || busy) return
    setBusy(true); setError('')
    try {
      if (needsPassword && !(await verifySecret(password, settings.pwSalt, settings.deletePasswordHash))) { setError('Incorrect password.'); return }
      if (mode === 'replace') await download('before-restore') // a way back, just in case
      const n = await restoreBackup(plan, BACKUP_TABLES.map(([k]) => k))
      showToast(`Restored ${n} record${n !== 1 ? 's' : ''}. They'll finish syncing to the cloud in the background.`, 'success')
      setRestore(null)
    } catch (e) {
      setError(`Restore stopped: ${e.message}`)
    } finally { setBusy(false) }
  }

  const when = iso => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }

  return (
    <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Backup &amp; restore</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5, maxWidth: 560 }}>
        Download everything — vouchers, accounts, clients, invoices and more — as one Excel file you can keep. Restore from it any time.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={onDownload} disabled={busy}><Download size={14} /> Download backup (Excel)</button>
        <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={14} /> Restore from backup…</button>
        <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={onPick} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Receipt photos and passwords aren't included in the file.</div>

      {restore && plan && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && !busy && setRestore(null)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <div className="modal-title">Restore from backup</div>
              <button className="icon-btn" onClick={() => setRestore(null)} disabled={busy} aria-label="Close"><X size={16} /></button>
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12 }}>
              <b>{restore.fileName}</b> — backup of {restore.backup.meta.company || 'this ledger'}, made {when(restore.backup.meta.createdAt)}.
            </div>
            {restore.backup.errors.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-dim)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12 }}>
                {restore.backup.errors.slice(0, 4).map((e, i) => <div key={i}>{e}</div>)}
                {restore.backup.errors.length > 4 && <div>…and {restore.backup.errors.length - 4} more.</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[['merge', "Add what's missing", "Brings back records that aren't in the app now. Nothing existing is changed.", <ShieldCheck size={15} key="i" color="var(--green)" />],
                ['replace', 'Replace everything', 'Everything in the app is replaced with the backup. For a full recovery.', <AlertTriangle size={15} key="i" color="var(--red)" />]]
                .map(([key, title, text, icon]) => (
                  <button key={key} onClick={() => { setMode(key); setError('') }} disabled={busy}
                    style={{ flex: '1 1 220px', textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      border: `2px solid ${mode === key ? (key === 'replace' ? 'var(--red)' : 'var(--accent)') : 'var(--border2)'}`, background: 'var(--surface)', color: 'var(--text-1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>{icon}{title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.4 }}>{text}</div>
                  </button>
                ))}
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ fontSize: 12 }}>
                <thead><tr><th>Data</th><th style={{ textAlign: 'right' }}>In backup</th><th style={{ textAlign: 'right' }}>Will be added</th>
                  {mode === 'merge' && <><th style={{ textAlign: 'right' }}>Already here</th><th style={{ textAlign: 'right' }}>Skipped</th></>}</tr></thead>
                <tbody>
                  {plan.summary.filter(s => s.inBackup > 0).map(s => (
                    <tr key={s.key}>
                      <td>{s.label}{s.reasons.length > 0 && <div style={{ fontSize: 11, color: 'var(--amber)' }}>{s.reasons.join('; ')}</div>}</td>
                      <td style={{ textAlign: 'right' }}>{s.inBackup}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.toAdd}</td>
                      {mode === 'merge' && <><td style={{ textAlign: 'right', color: 'var(--text-3)' }}>{s.alreadyHere}</td><td style={{ textAlign: 'right', color: s.skipped ? 'var(--amber)' : 'var(--text-3)' }}>{s.skipped}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.renumbered > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
                {plan.renumbered} restored voucher{plan.renumbered !== 1 ? 's use numbers' : ' uses a number'} already taken, so {plan.renumbered !== 1 ? 'they get' : 'it gets'} the next free number instead.
              </div>
            )}
            {mode === 'merge' && totalToAdd === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--green)', marginBottom: 10 }}>Everything in this backup is already in the app — nothing to add.</div>
            )}

            {mode === 'replace' && (
              <div style={{ background: 'var(--red-dim)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12, fontSize: 12.5, lineHeight: 1.5 }}>
                <b style={{ color: 'var(--red)' }}>Everything currently in the app will be replaced</b> with this backup, for everyone using this account.
                A backup of your current data downloads first, so you can go back. Passwords and Team Members stay as they are.
                {needsPassword && (
                  <input className="form-input" type="password" placeholder="Deletion password" value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }} style={{ marginTop: 8 }} />
                )}
                <input className="form-input" placeholder='Type REPLACE to confirm' value={confirmText} onChange={e => setConfirmText(e.target.value)} style={{ marginTop: 8 }} />
              </div>
            )}
            {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRestore(null)} disabled={busy}>Cancel</button>
              <button className={`btn ${mode === 'replace' ? 'btn-danger' : 'btn-primary'}`} onClick={onRestore} disabled={!ready || busy}>
                {busy ? 'Restoring…' : mode === 'replace' ? 'Replace everything' : `Add ${totalToAdd} record${totalToAdd !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
