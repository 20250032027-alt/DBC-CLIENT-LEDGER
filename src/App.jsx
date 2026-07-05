import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { ThemeProvider, useTheme } from './lib/theme.jsx'
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
import Billing from './pages/Billing'
import Settings from './pages/Settings'
import {
  LayoutDashboard, Users, FileText, Scale, Waves,
  BarChart3, Receipt, Settings as SettingsIcon, Menu, X,
  BookOpen, BookText, LogOut, AlertCircle, Loader2,
  WifiOff, RefreshCw, CloudUpload, CheckCircle2, Sun, Moon,
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
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

const PAGE_TITLES = {
  dashboard: 'Dashboard', clients: 'Clients', vouchers: 'Vouchers',
  accounts: 'Chart of Accounts', 'trial-balance': 'Trial Balance', 'account-listing': 'Account Listing', 'cash-flow': 'Cash Flow',
  financial: 'Financial Reports', billing: 'Billing', settings: 'Settings',
}

const PAGES = {
  dashboard: Dashboard, clients: Clients, vouchers: Vouchers,
  accounts: ChartOfAccounts, 'trial-balance': TrialBalance, 'account-listing': AccountListing, 'cash-flow': CashFlow,
  financial: FinancialCondition, billing: Billing, settings: Settings,
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

function AppShell({ userEmail }) {
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { loading, error, clearError, conflicts, clearConflicts } = useStore()
  const Page = PAGES[page]

  function navigate(id) { setPage(id); setSidebarOpen(false) }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        <Loader2 size={22} className="spin" />
        <span style={{ fontSize: 13 }}>Loading your data…</span>
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

        <main><Page userEmail={userEmail} /></main>
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

function AppInner() {
  const [session, setSession] = useState(undefined) // undefined = checking, null = signed out

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

  return (
    <StoreProvider userId={session.user.id} initialCompany={session.user.user_metadata?.company_name}>
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
