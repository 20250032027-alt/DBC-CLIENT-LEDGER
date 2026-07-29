import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { ThemeProvider, useTheme } from './lib/theme.jsx'
import { getInstallState, promptInstall } from './lib/installPrompt'
import { StoreProvider, useStore } from './store/useStore.jsx'
import { onToast, showToast } from './lib/toast'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Vouchers from './pages/Vouchers'
import ChartOfAccounts from './pages/ChartOfAccounts'
import TrialBalance from './pages/TrialBalance'
import AccountListing from './pages/AccountListing'
import CashFlow from './pages/CashFlow'
import FinancialCondition from './pages/FinancialCondition'
import TaxReport from './pages/TaxReport'
import TaxReturn from './pages/TaxReturn'
import EWTReport from './pages/EWTReport'
import Billing from './pages/Billing'
import Settings from './pages/Settings'
import {
  LayoutDashboard, Users, FileText, Scale, Waves,
  BarChart3, Receipt, Settings as SettingsIcon, Menu, X,
  BookOpen, BookText, LogOut, AlertCircle, Loader2,
  WifiOff, RefreshCw, CloudUpload, CheckCircle2, Sun, Moon, Smartphone, Clock,
  FileBarChart, FileCheck, Percent,
} from 'lucide-react'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'vouchers', label: 'Vouchers', icon: FileText },
  { id: 'accounts', label: 'Chart of Accounts', icon: BookText },
  { id: 'trial-balance', label: 'Trial Balance', icon: Scale },
  { id: 'account-listing', label: 'Account Listing', icon: BookOpen },
  { id: 'cash-flow', label: 'Cash Flow', icon: Waves },
  { id: 'financial', label: 'Financial Reports', icon: BarChart3 },
  { id: 'tax-report', label: 'Tax Report', icon: FileBarChart },
  { id: 'tax-return', label: 'Tax Return', icon: FileCheck },
  { id: 'ewt-report', label: 'EWT Report', icon: Percent },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

const PAGE_TITLES = {
  dashboard: 'Dashboard', clients: 'Clients', vouchers: 'Vouchers',
  accounts: 'Chart of Accounts', 'trial-balance': 'Trial Balance', 'account-listing': 'Account Listing', 'cash-flow': 'Cash Flow',
  financial: 'Financial Reports', 'tax-report': 'Tax Report', 'tax-return': 'Tax Return', 'ewt-report': 'EWT Report', billing: 'Billing', settings: 'Settings',
}

const PAGES = {
  dashboard: Dashboard, clients: Clients, vouchers: Vouchers,
  accounts: ChartOfAccounts, 'trial-balance': TrialBalance, 'account-listing': AccountListing, 'cash-flow': CashFlow,
  financial: FinancialCondition, 'tax-report': TaxReport, 'tax-return': TaxReturn, 'ewt-report': EWTReport, billing: Billing, settings: Settings,
}

function ToastHost() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    return onToast((toast) => {
      setToasts(t => [...t, toast])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== toast.id)), toast.duration)
    })
  }, [])

  const iconFor = (kind) => {
    if (kind === 'offline') return <WifiOff size={14} />
    if (kind === 'offline-save') return <CloudUpload size={14} />
    if (kind === 'synced') return <CheckCircle2 size={14} />
    return <RefreshCw size={14} />
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 2000,
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 420,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          fontSize: 12.5, color: 'var(--text-1)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {iconFor(t.kind)}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

function ConnectivityWatcher() {
  useEffect(() => {
    let wasOffline = !navigator.onLine
    function goOffline() {
      wasOffline = true
      showToast("You're offline. You can keep working — changes save on this device and will sync automatically once you're back online.", 'offline', 6000)
    }
    function goOnline() {
      if (wasOffline) showToast('Back online — syncing your changes…', 'sync', 3000)
      wasOffline = false
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline) }
  }, [])
  return null
}

function SyncPill() {
  const { syncStatus, pending } = useStore()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const hadPending = useRef(false)
  useEffect(() => {
    if (pending > 0) hadPending.current = true
    else if (hadPending.current && syncStatus === 'idle') {
      hadPending.current = false
      showToast('All changes synced.', 'synced', 2500)
    }
  }, [pending, syncStatus])

  let icon = <CheckCircle2 size={12} />, label = 'Synced', color = 'var(--green)'
  if (!online) { icon = <WifiOff size={12} />; label = pending > 0 ? `Offline · ${pending} pending` : 'Offline'; color = 'var(--text-3)' }
  else if (syncStatus === 'syncing') { icon = <RefreshCw size={12} className="spin" />; label = 'Syncing…'; color = 'var(--accent)' }
  else if (syncStatus === 'error') { icon = <CloudUpload size={12} />; label = `${pending} pending — retrying`; color = 'var(--amber)' }
  else if (pending > 0) { icon = <CloudUpload size={12} />; label = `${pending} pending`; color = 'var(--amber)' }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color, marginLeft: 'auto' }}>
      {icon}{label}
    </span>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      className="icon-btn"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle dark mode"
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  )
}

function InstallBanner() {
  const [state, setState] = useState('installed') // 'installed' | 'native' | 'ios' | 'manual'
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('dbc-ledger-install-dismissed') === '1')
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    setState(getInstallState())
    const onChange = () => setState(getInstallState())
    window.addEventListener('dbc-ledger-install-available', onChange)
    return () => window.removeEventListener('dbc-ledger-install-available', onChange)
  }, [])

  function dismiss() {
    setDismissed(true)
    localStorage.setItem('dbc-ledger-install-dismissed', '1')
  }

  async function handleInstall() {
    if (state === 'native') {
      await promptInstall()
    } else {
      setShowIOSHelp(true)
    }
  }

  if (state === 'installed' || dismissed) return null

  return (
    <div className="install-banner" style={{
      margin: '12px 24px 0', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
      background: 'var(--accent-glow)', border: '1px solid var(--accent)',
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5,
    }}>
      <Smartphone size={15} style={{ flexShrink: 0, color: 'var(--accent)' }} />
      <span style={{ flex: 1 }}>Install DBC Client Ledger on this device for quicker, full offline access.</span>
      <button className="btn btn-sm" onClick={handleInstall} style={{ flexShrink: 0 }}>
        Install
      </button>
      <button onClick={dismiss} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', flexShrink: 0 }}>
        <X size={14} />
      </button>

      {showIOSHelp && (
        <div className="modal-backdrop" onClick={() => setShowIOSHelp(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add to Home Screen</span>
              <button className="icon-btn" onClick={() => setShowIOSHelp(false)}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-2)' }}>
              {state === 'ios' ? (
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
  )
}

function AppShell({ userEmail, bypassApprovalGate }) {
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { loading, error, clearError, conflicts, clearConflicts, settings } = useStore()
  const Page = PAGES[page]

  // ── Team Members (Settings → Team Members): a lightweight, UI-level
  // layer on top of the one shared login, so several people can use the
  // same account and each get their own restricted, read-only-on-some-tabs
  // view. This is NOT a real per-user security boundary — see the comment
  // in migrations/006_team_members.sql for why. bypassApprovalGate also
  // means "this is the admin using Manage Ledger", which always gets full
  // access regardless of the client's own team setup.
  const teamMembers = settings.teamMembers || []
  const TEAM_STORAGE_KEY = 'dbc_active_team_member'
  const [activeMemberId, setActiveMemberId] = useState(() => {
    try { return localStorage.getItem(TEAM_STORAGE_KEY) } catch { return null }
  })
  const [pendingMemberId, setPendingMemberId] = useState(null)
  const [teamPassword, setTeamPassword] = useState('')
  const [teamError, setTeamError] = useState('')

  const activeMember = teamMembers.find(m => m.id === activeMemberId) || null

  function switchUser() {
    try { localStorage.removeItem(TEAM_STORAGE_KEY) } catch { /* ignore */ }
    setActiveMemberId(null)
    setPendingMemberId(null)
    setTeamPassword('')
    setTeamError('')
  }

  function confirmMember(member) {
    if (teamPassword !== member.password) { setTeamError('Incorrect password.'); return }
    try { localStorage.setItem(TEAM_STORAGE_KEY, member.id) } catch { /* ignore */ }
    setActiveMemberId(member.id)
    setPendingMemberId(null)
    setTeamPassword('')
    setTeamError('')
  }

  const canEditPage = bypassApprovalGate || !activeMember || activeMember.isAdmin ||
    !!(activeMember.permissions && activeMember.permissions[page])

  function navigate(id) { setPage(id); setSidebarOpen(false) }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        <Loader2 size={22} className="spin" />
        <span style={{ fontSize: 13 }}>Loading your data…</span>
      </div>
    )
  }

  if (!bypassApprovalGate && !settings.approved) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', padding: 24, textAlign: 'center' }}>
        <Clock size={28} style={{ color: 'var(--amber)' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Your account is pending approval</div>
        <div style={{ fontSize: 13, maxWidth: 380 }}>
          Someone needs to approve your account before you can start using it. You'll be able to sign
          in normally as soon as that happens — no need to sign up again.
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    )
  }

  // Identification gate — appears once team members exist, on any device
  // that hasn't identified itself yet (or after "Switch User"). Skipped
  // entirely for admin impersonation.
  if (!bypassApprovalGate && teamMembers.length > 0 && !activeMember) {
    const pendingMember = teamMembers.find(m => m.id === pendingMemberId)
    if (pendingMember) {
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Hi, {pendingMember.name}</div>
          <input
            autoFocus type="password" className="form-input" style={{ maxWidth: 240 }}
            value={teamPassword}
            onChange={e => { setTeamPassword(e.target.value); setTeamError('') }}
            onKeyDown={e => e.key === 'Enter' && confirmMember(pendingMember)}
            placeholder="Password"
          />
          {teamError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{teamError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setPendingMemberId(null); setTeamPassword(''); setTeamError('') }}>Back</button>
            <button className="btn btn-primary" onClick={() => confirmMember(pendingMember)}>Continue</button>
          </div>
        </div>
      )
    }
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Who's using this?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}>
          {teamMembers.map(m => (
            <button key={m.id} className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setPendingMemberId(m.id)}>
              {m.name}{m.isAdmin ? ' (Admin)' : ''}
            </button>
          ))}
        </div>
        <button
          className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--text-3)' }}
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut size={12} /> Not you? Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark"><BookOpen size={16} color="#fff" /></div>
          <div>
            <div className="sidebar-logo-text">DBC Ledger</div>
            <div className="sidebar-logo-sub">Accounting</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          {NAV.slice(0, 2).map(({ id, label, icon: Icon }) => (
            <div key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={16} />{label}
            </div>
          ))}
          <div className="nav-section-label">Accounting</div>
          {NAV.slice(2, 8).map(({ id, label, icon: Icon }) => (
            <div key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={16} />{label}
            </div>
          ))}
          <div className="nav-section-label">Finance</div>
          {NAV.slice(8, 9).map(({ id, label, icon: Icon }) => (
            <div key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={16} />{label}
            </div>
          ))}
          <div className="nav-section-label">System</div>
          {NAV.slice(9).map(({ id, label, icon: Icon }) => (
            <div key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={16} />{label}
            </div>
          ))}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userEmail}
          </div>
          {teamMembers.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Viewing as {activeMember ? activeMember.name : 'Owner'}
              </span>
              <button
                onClick={switchUser}
                style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', flexShrink: 0 }}
              >
                Switch
              </button>
            </div>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(v => !v)}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="topbar-title">{PAGE_TITLES[page]}</div>
          <span className="topbar-date">{format(new Date(), 'EEEE, MMM d, yyyy')}</span>
          <ThemeToggle />
          <SyncPill />
        </header>

        <InstallBanner />

        {conflicts.length > 0 && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: 'var(--amber)15', border: '1px solid var(--amber)40',
            color: 'var(--amber)', fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              {conflicts.length} change{conflicts.length > 1 ? 's' : ''} from another device took priority over an offline edit made on this one:
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {conflicts.slice(0, 5).map(c => <li key={c.id}>{c.message}</li>)}
              </ul>
            </div>
            <button onClick={clearConflicts} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {error && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: 'var(--red)15', border: '1px solid var(--red)40',
            color: 'var(--red)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={clearError} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        <main>
          {!canEditPage && (
            <div style={{
              position: 'sticky', top: 0, zIndex: 5, textAlign: 'center',
              background: 'var(--amber)', color: '#111', fontSize: 12, fontWeight: 600,
              padding: '6px 12px',
            }}>
              View only for {activeMember?.name} on this tab — ask an admin for edit access.
            </div>
          )}
          <div style={!canEditPage ? { pointerEvents: 'none', opacity: 0.6, userSelect: 'none' } : undefined}>
            <Page userEmail={userEmail} />
          </div>
        </main>
      </div>
    </div>
  )
}

function ConfigMissing() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 20,
    }}>
      <div className="card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <AlertCircle size={20} color="var(--red)" />
          <span className="modal-title">Supabase isn't configured</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          This app needs <code className="text-mono">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-mono">VITE_SUPABASE_ANON_KEY</code> to start.
          <br /><br />
          If you're running locally: copy <code className="text-mono">.env.example</code> to{' '}
          <code className="text-mono">.env</code> and fill them in.
          <br /><br />
          If this is deployed on Vercel: add both in Project Settings →
          Environment Variables, then redeploy — env vars only take effect on
          the next build, not automatically.
        </div>
      </div>
    </div>
  )
}

// New accounts need this email's approval before they can use the app.
const ADMIN_EMAIL = 'etaxbir@gmail.com'

function AdminConsole({ onView }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setError(null)
    const { data, error: err } = await supabase
      .from('settings')
      .select('user_id, email, company, approved, updated_at')
      .order('updated_at', { ascending: false })
    if (err) setError(err.message)
    else setRows(data)
  }

  useEffect(() => {
    load()
    // New signups can take a moment to actually reach the cloud — poll
    // periodically so a pending account shows up without needing a manual
    // page reload to notice it.
    const interval = setInterval(load, 20000)
    return () => clearInterval(interval)
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function setApproved(userId, approved) {
    setBusyId(userId)
    const { error: err } = await supabase.from('settings').update({ approved }).eq('user_id', userId)
    if (err) showToast(err.message, 'error')
    await load()
    setBusyId(null)
  }

  const pending = (rows || []).filter(r => !r.approved)
  const approved = (rows || []).filter(r => r.approved)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Account Approvals</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={refreshing} onClick={handleRefresh}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>

        {error && <div style={{ color: 'var(--red)', marginBottom: 16 }}>{error}</div>}
        {!rows && !error && <div style={{ color: 'var(--text-2)' }}><Loader2 size={16} className="spin" /> Loading…</div>}

        {rows && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>
                Pending Approval {pending.length > 0 && <span className="badge badge-amber" style={{ marginLeft: 6 }}>{pending.length}</span>}
              </div>
              {pending.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nothing waiting on you.</div>
              ) : pending.map(r => (
                <div key={r.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.company || '(no company name yet)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.email || r.user_id}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onView(r.user_id, r.company)}>
                      Manage Ledger
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={busyId === r.user_id} onClick={() => setApproved(r.user_id, true)}>
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Approved Accounts</div>
              {approved.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>None yet.</div>
              ) : approved.map(r => (
                <div key={r.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.company || '(no company name yet)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.email || r.user_id}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onView(r.user_id, r.company)}>
                      Manage Ledger
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={busyId === r.user_id} onClick={() => setApproved(r.user_id, false)}>
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Persistent, unmissable strip shown while the admin is inside a client's
// ledger — so it's never ambiguous whose books are on screen.
function AdminBanner({ company, onExit }) {
  return (
    <div style={{
      background: 'var(--red)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: '8px 16px', fontSize: 13, fontWeight: 600,
    }}>
      <span>Admin mode — viewing {company || 'this client'}'s ledger</span>
      <button
        onClick={onExit}
        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >
        Exit
      </button>
    </div>
  )
}

function AppInner() {
  const [session, setSession] = useState(undefined) // undefined = checking, null = signed out

  const [viewingClient, setViewingClient] = useState(null) // { userId, company } | null

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return <ConfigMissing />

  if (session === undefined) {
    return (
      <>
        <ToastHost /><ConnectivityWatcher />
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
          <Loader2 size={22} className="spin" />
        </div>
      </>
    )
  }

  if (!session) return <><ToastHost /><ConnectivityWatcher /><Login /></>

  if (session.user.email === ADMIN_EMAIL) {
    if (viewingClient) {
      return (
        <StoreProvider userId={viewingClient.userId} userEmail={ADMIN_EMAIL}>
          <ToastHost /><ConnectivityWatcher />
          <AdminBanner company={viewingClient.company} onExit={() => setViewingClient(null)} />
          <AppShell userEmail={ADMIN_EMAIL} bypassApprovalGate />
        </StoreProvider>
      )
    }
    return (
      <>
        <ToastHost /><ConnectivityWatcher />
        <AdminConsole onView={(userId, company) => setViewingClient({ userId, company })} />
      </>
    )
  }

  return (
    <StoreProvider userId={session.user.id} initialCompany={session.user.user_metadata?.company_name} userEmail={session.user.email}>
      <ToastHost /><ConnectivityWatcher />
      <AppShell userEmail={session.user.email} />
    </StoreProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
