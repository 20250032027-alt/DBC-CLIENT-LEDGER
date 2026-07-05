import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmt } from '../utils'
import { Plus, X, Trash2, Pencil, BookOpen, Sparkles } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'

const TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
]
const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.value, t.label]))
const TYPE_COLOR = {
  asset: '#3b82f6',
  liability: '#ef4444',
  equity: '#a78bfa',
  revenue: '#22c55e',
  expense: '#f59e0b',
}
const TYPE_BADGE = {
  asset: 'badge-blue',
  liability: 'badge-red',
  equity: 'badge-purple',
  revenue: 'badge-green',
  expense: 'badge-amber',
}

// Assets & expenses carry a normal debit balance; liabilities, equity &
// revenue carry a normal credit balance. We flip the sign for the latter
// so "normal" always reads as a positive number, the way a balance sheet does.
function normalSide(type) { return type === 'asset' || type === 'expense' ? 1 : -1 }

function AccountModal({ account, onClose, onSave }) {
  const [form, setForm] = useState(account || { code: '', name: '', type: 'asset', description: '' })
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Auto-suggest type from account code prefix
  function handleCodeChange(code) {
    set('code', code)
    if (account) return // don't override type when editing
    const n = parseInt(code, 10)
    if (n >= 1000 && n < 2000) set('type', 'asset')
    else if (n >= 2000 && n < 3000) set('type', 'liability')
    else if (n >= 3000 && n < 4000) set('type', 'equity')
    else if (n >= 4000 && n < 5000) set('type', 'revenue')
    else if (n >= 5000) set('type', 'expense')
  }

  function submit() { if (form.name) onSave(form) }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <span className="modal-title">{account ? 'Edit Account' : 'New Account'}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Code</label>
            <input autoFocus className="form-input" value={form.code || ''}
              onChange={e => handleCodeChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="1000" />
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
              1xxx Asset · 2xxx Liability · 3xxx Equity · 4xxx Revenue · 5xxx Expense
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Account Name *</label>
            <input className="form-input" value={form.name}
              onChange={e => set('name', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Cash" />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={form.description || ''}
              onChange={e => set('description', e.target.value)}
              placeholder="What this account is used for..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!form.name} onClick={submit}>
            {account ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-1)', fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
      <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>{TYPE_LABEL[p.type]}</div>
      <div style={{ fontFamily: 'var(--mono)', color: p.balance < 0 ? 'var(--red)' : 'var(--text-1)' }}>
        {fmt(p.balance, p.currency)}
      </div>
    </div>
  )
}

export default function ChartOfAccounts() {
  const {
    accounts, vouchers, settings,
    addAccount, updateAccount, deleteAccount, seedDefaultAccounts,
  } = useStore()
  const cur = settings.currency
  const [modal, setModal] = useState(null)

  // Net debit/credit posted to each account name (case-insensitive),
  // gathered from every voucher entry across the whole ledger.
  const ledgerTotals = useMemo(() => {
    const map = {}
    vouchers.forEach(v => (v.entries || []).forEach(e => {
      if (!e.account) return
      const key = e.account.trim().toLowerCase()
      if (!map[key]) map[key] = { debit: 0, credit: 0 }
      map[key].debit += parseFloat(e.debit || 0)
      map[key].credit += parseFloat(e.credit || 0)
    }))
    return map
  }, [vouchers])

  function balanceFor(account) {
    const t = ledgerTotals[account.name.trim().toLowerCase()]
    if (!t) return 0
    return (t.debit - t.credit) * normalSide(account.type)
  }

  const totals = TYPES.reduce((acc, t) => {
    acc[t.value] = accounts.filter(a => a.type === t.value).reduce((s, a) => s + balanceFor(a), 0)
    return acc
  }, {})

  const chartData = accounts
    .map(a => ({ name: a.name, type: a.type, balance: balanceFor(a), currency: cur }))
    .filter(a => Math.abs(a.balance) > 0.005)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    .slice(0, 12)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Chart of Accounts</div>
          <div className="page-sub">{accounts.length} account{accounts.length !== 1 ? 's' : ''} · master list &amp; balances</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={15} /> New Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BookOpen size={36} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No accounts yet</div>
            <div style={{ fontSize: 13 }}>Start from a standard starter chart, or add accounts one by one</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={seedDefaultAccounts}>
                <Sparkles size={14} /> Use Starter Chart of Accounts
              </button>
              <button className="btn btn-ghost" onClick={() => setModal('new')}>
                <Plus size={14} /> Add One Manually
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            {TYPES.map(t => (
              <div className="stat-card" key={t.value}>
                <span className="stat-label">{t.label}s</span>
                <div className="stat-value" style={{ color: TYPE_COLOR[t.value], fontSize: 18 }}>
                  {fmt(totals[t.value], cur)}
                </div>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div>
                  <div className="card-title">Account Balances</div>
                  <div className="card-sub">Top accounts by activity, from posted vouchers</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 30)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="balance" radius={[0, 4, 4, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={TYPE_COLOR[d.type]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => {
                  const bal = balanceFor(a)
                  return (
                    <tr key={a.id}>
                      <td className="td-mono">{a.code || '—'}</td>
                      <td style={{ fontWeight: 500 }}>{a.name}</td>
                      <td><span className={`badge ${TYPE_BADGE[a.type]}`}>{TYPE_LABEL[a.type]}</span></td>
                      <td style={{ color: 'var(--text-2)', fontSize: 12, maxWidth: 260 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.description || '—'}
                        </div>
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', color: bal === 0 ? 'var(--text-2)' : bal < 0 ? 'var(--red)' : 'var(--text-1)' }}>
                        {bal === 0 ? '—' : fmt(bal, cur)}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" onClick={() => setModal(a)} title="Edit"><Pencil size={14} /></button>
                          <button className="icon-btn" onClick={() => deleteAccount(a.id)} title="Delete" style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && (
        <AccountModal
          account={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={form => {
            if (modal === 'new') addAccount(form)
            else updateAccount(modal.id, form)
            setModal(null)
          }}
        />
      )}
    </div>
  )
}
