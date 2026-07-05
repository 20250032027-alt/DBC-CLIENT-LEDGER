import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { BookOpen, LogIn, UserPlus, AlertCircle, MailCheck } from 'lucide-react'

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  function switchMode(next) {
    setMode(next); setError(null); setCheckEmail(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: { data: { company_name: company.trim() || undefined } },
      })
      setLoading(false)
      if (signUpError) { setError(signUpError.message); return }
      // If email confirmations are on, Supabase returns a user but no active
      // session yet — the account exists but can't sign in until confirmed.
      if (data.user && !data.session) {
        setCheckEmail(true)
        return
      }
      // Otherwise data.session is already set and onAuthStateChange (in App.jsx)
      // picks it up automatically — nothing else to do here.
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) setError(signInError.message)
  }

  if (checkEmail) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', padding: 20,
      }}>
        <div className="card" style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
          <MailCheck size={28} color="var(--accent)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Check your email</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 16 }}>
            We sent a confirmation link to <strong style={{ color: 'var(--text-1)' }}>{email}</strong>.
            Confirm your account, then sign in below.
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => switchMode('signin')}>
            Back to Sign In
          </button>
        </div>
      </div>
    )
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
            <div className="sidebar-logo-sub">
              {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
            </div>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 2, marginBottom: 18 }}>
          {[['signin', 'Sign In'], ['signup', 'Create Account']].map(([m, label]) => (
            <button key={m} type="button" onClick={() => switchMode(m)} style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--text-3)',
            }}>{label}</button>
          ))}
        </div>

        {mode === 'signup' && (
          <div className="form-group">
            <label className="form-label">Company / Business Name</label>
            <input
              className="form-input" type="text" autoComplete="organization"
              value={company} onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Santos Trading"
            />
          </div>
        )}

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
            className="form-input" type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required
            minLength={mode === 'signup' ? 6 : undefined}
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
          {mode === 'signup' ? <UserPlus size={14} /> : <LogIn size={14} />}
          {loading
            ? (mode === 'signup' ? 'Creating account…' : 'Signing in…')
            : (mode === 'signup' ? 'Create Account' : 'Sign In')}
        </button>

        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16, lineHeight: 1.5 }}>
          {mode === 'signin'
            ? <>New here? <a onClick={() => switchMode('signup')} style={{ color: 'var(--accent)', cursor: 'pointer' }}>Create your own account</a> — each account's data is completely separate.</>
            : <>Already have an account? <a onClick={() => switchMode('signin')} style={{ color: 'var(--accent)', cursor: 'pointer' }}>Sign in</a>.</>}
        </div>
      </form>
    </div>
  )
}
