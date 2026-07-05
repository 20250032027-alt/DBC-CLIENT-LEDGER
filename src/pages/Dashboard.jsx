import { useEffect } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt, fmtDate } from '../utils'
import {
  Users, FileText, Receipt, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Circle, RefreshCw,
} from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

function StatCard({ label, value, icon: Icon, changeDir }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="stat-label">{label}</span>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--surface2)',
          display: 'grid', placeItems: 'center', color: 'var(--accent)',
          flexShrink: 0,
        }}>
          <Icon size={15} />
        </div>
      </div>
      <div className="stat-value" style={{ wordBreak: 'break-word' }}>{value}</div>
      {changeDir && (
        <div className={`stat-change ${changeDir === 'up' ? 'stat-up' : 'stat-down'}`}>
          {changeDir === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {changeDir === 'up' ? 'Income' : 'Expense'}
        </div>
      )}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontFamily: 'var(--mono)' }}>
          {p.name}: ₱{p.value.toLocaleString()}
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { clients, vouchers, bills, settings, refresh, loading } = useStore()
  const cur = settings.currency

  // Refresh data when dashboard comes into focus (mobile-friendly)
  useEffect(() => {
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  // ── Helpers (same logic as CashFlow.jsx) ────────────────────
  function isCashAccount(name = '') {
    const a = name.toLowerCase()
    return a.includes('cash') || a.includes('bank')
  }
  function cashDelta(entries = []) {
    return entries
      .filter(e => isCashAccount(e.account))
      .reduce((s, e) => s + parseFloat(e.debit || 0) - parseFloat(e.credit || 0), 0)
  }

  // ── Revenue: all bills (accrual) ────────────────────────────
  const totalRevenue = bills.reduce((s, b) => s + parseFloat(b.total || 0), 0)
  const totalPaid = bills.filter(b => b.status === 'paid').reduce((s, b) => s + parseFloat(b.total || 0), 0)
  const totalUnpaid = bills.filter(b => b.status !== 'paid').reduce((s, b) => s + parseFloat(b.total || 0), 0)

  // ── Expenses: credit-side of cash/bank movements (cash out) ─
  // Same as CashFlow: a voucher moves money out when its cash/bank entries
  // are net credit (cash decreases). This matches what CashFlow shows.
  const cashOutVouchers = vouchers.filter(v => cashDelta(v.entries) < 0)
  const totalExpenses = cashOutVouchers
    .reduce((s, v) => s + Math.abs(cashDelta(v.entries)), 0)

  // ── Net position ─────────────────────────────────────────────
  const netPosition = totalPaid - totalExpenses

  // ── Chart: last 6 months using voucher date field ────────────
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const label = d.toLocaleString('en', { month: 'short' })
    const yr = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const monthPrefix = `${yr}-${mo}`

    const rev = bills.filter(b => {
      const ds = b.date || (b.createdAt ? b.createdAt.slice(0, 7) : '')
      return ds.startsWith(monthPrefix) && b.status === 'paid'
    }).reduce((s, b) => s + parseFloat(b.total || 0), 0)

    const exp = vouchers.filter(v => {
      const ds = v.date || (v.createdAt ? v.createdAt.slice(0, 7) : '')
      return ds.startsWith(monthPrefix)
    }).reduce((s, v) => {
      const delta = cashDelta(v.entries)
      return delta < 0 ? s + Math.abs(delta) : s
    }, 0)

    months.push({ label, revenue: rev, expenses: exp })
  }

  const recentBills = [...bills].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Overview</div>
          <div className="page-sub">Financial snapshot</div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={refresh}
          disabled={loading}
          style={{ fontSize: 12 }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="stat-grid">
        <StatCard label="Total Clients" value={clients.length} icon={Users} />
        <StatCard label="Billed Revenue" value={fmt(totalRevenue, cur)} icon={TrendingUp} changeDir="up" />
        <StatCard label="Cash Out" value={fmt(totalExpenses, cur)} icon={TrendingDown} changeDir="down" />
        <StatCard label="Outstanding" value={fmt(totalUnpaid, cur)} icon={Receipt} />
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Revenue vs Expenses</div>
              <div className="card-sub">Last 6 months</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={months} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#gRev)" />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gExp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Invoices</div>
          </div>
          {recentBills.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <FileText size={24} />
              <span style={{ fontSize: 13 }}>No invoices yet</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentBills.map(b => (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                  gap: 8,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.number}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.clientName}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="text-mono" style={{ fontSize: 12 }}>{fmt(b.total, cur)}</div>
                    <span className={`badge ${b.status === 'paid' ? 'badge-green' : b.status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>
                      <Circle size={5} fill="currentColor" />
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Vouchers</div>
          </div>
          {vouchers.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <FileText size={20} />
              <span style={{ fontSize: 12 }}>No vouchers yet</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...vouchers].reverse().slice(0, 4).map(v => (
                <div key={v.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                  gap: 8,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{v.number}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>{v.type}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flexShrink: 0 }}>{v.date || fmtDate(v.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Summary</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Total Vouchers', val: vouchers.length },
              { label: 'Total Invoices', val: bills.length },
              { label: 'Paid Invoices', val: bills.filter(b => b.status === 'paid').length },
              { label: 'Overdue Invoices', val: bills.filter(b => b.status === 'overdue').length },
              { label: 'Collected', val: fmt(totalPaid, cur), color: 'var(--green)' },
              { label: 'Net Position', val: fmt(netPosition, cur), color: netPosition >= 0 ? 'var(--green)' : 'var(--red)', bold: true },
            ].map(r => (
              <div key={r.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 0', borderBottom: '1px solid var(--border)',
                fontSize: 13, gap: 8,
              }}>
                <span style={{ color: 'var(--text-2)' }}>{r.label}</span>
                <span style={{
                  fontFamily: 'var(--mono)',
                  color: r.color || 'var(--text-1)',
                  fontWeight: r.bold ? 600 : 400,
                  flexShrink: 0,
                }}>{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
