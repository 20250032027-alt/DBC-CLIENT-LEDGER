import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { BookOpen, LogIn, AlertCircle } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) setError(signInError.message)
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 20,
    }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div className="sidebar-logo-mark"><BookOpen size={16} color="#fff" /></div>
          <div>
            <div className="sidebar-logo-text">DBC Ledger</div>
            <div className="sidebar-logo-sub">Sign in to continue</div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            className="form-input" type="email" autoComplete="email" required
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input" type="password" autoComplete="current-password" required
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div style={{
            display: 'flex', gap: 6, alignItems: 'flex-start', color: 'var(--red)',
            fontSize: 12, marginBottom: 14, marginTop: 2,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
          <LogIn size={14} /> {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16, lineHeight: 1.5 }}>
          This is a single-user account. To create or reset it, open your Supabase
          project's Authentication → Users page.
        </div>
      </form>
    </div>
  )
}
