import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { useStore } from '../store/useStore.jsx'
import { VOUCHER_ACTIONS, voucherLock, generateSalt, hashSecret, verifySecret } from '../utils'
import { showToast } from '../lib/toast'

// Settings → Data: an optional password for each voucher action. Changing or
// removing a password that's already set asks for the current one first,
// so it can't simply be switched off by whoever has the Settings page open.
export default function VoucherPasswords() {
  const { settings, updateSettings } = useStore()
  const [editing, setEditing] = useState(null) // action key
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The full set as it stands now — on first use this carries over the old
  // deletion password for delete and post, so nothing loses protection.
  const effective = () => Object.fromEntries(VOUCHER_ACTIONS.map(a => [a.key, voucherLock(settings, a.key)]))

  function open(key) { setEditing(key); setCurrent(''); setNext(''); setError('') }

  async function save(remove) {
    const lock = voucherLock(settings, editing)
    if (!remove && next.trim().length < 4) { setError('Use at least 4 characters.'); return }
    setBusy(true)
    try {
      if (lock && !(await verifySecret(current, lock.salt, lock.hash))) { setError('The current password is incorrect.'); return }
      const salt = generateSalt()
      const voucherPasswords = { ...effective(), [editing]: remove ? null : { hash: await hashSecret(next.trim(), salt), salt } }
      await updateSettings({ ...settings, voucherPasswords })
      showToast(remove ? 'Password turned off.' : 'Password saved.', 'success')
      setEditing(null)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Voucher passwords</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5, maxWidth: 560 }}>
        Ask for a password before any of these. Each one is separate, so you can protect only what you need, or use the same password for all of them.
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', maxWidth: 620 }}>
        {VOUCHER_ACTIONS.map((a, i) => {
          const on = !!voucherLock(settings, a.key)
          return (
            <div key={a.key} style={{ padding: '10px 12px', borderTop: i ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {on ? <Lock size={15} color="var(--green)" /> : <Unlock size={15} color="var(--text-3)" />}
                <div style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{a.help}</div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: on ? 'var(--green)' : 'var(--text-3)' }}>{on ? 'Password on' : 'Off'}</span>
                {editing !== a.key && (
                  <button className="btn btn-ghost btn-sm" onClick={() => open(a.key)}>{on ? 'Change' : 'Set password'}</button>
                )}
              </div>
              {editing === a.key && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                  {on && <input className="form-input" type="password" placeholder="Current password" value={current}
                    onChange={e => { setCurrent(e.target.value); setError('') }} style={{ flex: '1 1 150px' }} />}
                  <input autoFocus={!on} className="form-input" type="password" placeholder={on ? 'New password' : 'Password'} value={next}
                    onChange={e => { setNext(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && save(false)} style={{ flex: '1 1 150px' }} />
                  <button className="btn btn-primary btn-sm" onClick={() => save(false)} disabled={busy || !next.trim()}>Save</button>
                  {on && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => save(true)} disabled={busy || !current}>Turn off</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                  {error && <div style={{ fontSize: 12, color: 'var(--red)', width: '100%' }}>{error}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, maxWidth: 560 }}>
        Saved immediately. Only a scrambled (hashed) version is stored, never the password itself.
      </div>
    </div>
  )
}
