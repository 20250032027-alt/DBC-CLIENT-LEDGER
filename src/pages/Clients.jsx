import { useState } from 'react'
import { useStore } from '../store/useStore.jsx'
import { fmtDate, fmt } from '../utils'
import { Plus, Search, Trash2, Pencil, User, Building2, Phone, Mail, MapPin, X } from 'lucide-react'

function ClientModal({ client, onClose, onSave }) {
  const [form, setForm] = useState(client || {
    name: '', company: '', email: '', phone: '', address: '', type: 'individual', notes: '',
  })
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function submit() { if (form.name) onSave(form) }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <span className="modal-title">{client ? 'Edit Client' : 'New Client'}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input autoFocus className="form-input" value={form.name}
              onChange={e => set('name', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Juan dela Cruz" />
          </div>
          <div className="form-group">
            <label className="form-label">Company</label>
            <input className="form-input" value={form.company}
              onChange={e => set('company', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Acme Corp" />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email}
              onChange={e => set('email', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="juan@email.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="form-input" value={form.phone}
              onChange={e => set('phone', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="+63 912 345 6789" />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="individual">Individual</option>
              <option value="business">Business</option>
              <option value="government">Government</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-input" value={form.address}
              onChange={e => set('address', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="123 Rizal St, Davao City" />
          </div>
          <div className="form-group form-col-full">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Additional notes..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>
            {client ? 'Save Changes' : 'Add Client'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Clients() {
  const { clients, addClient, updateClient, deleteClient, bills, settings } = useStore()
  const [modal, setModal] = useState(null) // null | 'new' | client object
  const [search, setSearch] = useState('')

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  function getClientTotal(id) {
    return bills.filter(b => b.clientId === id && b.status === 'paid')
      .reduce((s, b) => s + parseFloat(b.total || 0), 0)
  }

  function getClientOutstanding(id) {
    return bills.filter(b => b.clientId === id && b.status !== 'paid')
      .reduce((s, b) => s + parseFloat(b.total || 0), 0)
  }

  function getClientUnpaidInvoices(id) {
    return bills.filter(b => b.clientId === id && b.status !== 'paid')
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-h1">Clients</div>
          <div className="page-sub">{clients.length} registered client{clients.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={15} /> Add Client
        </button>
      </div>

      <div className="toolbar">
        <div className="search-bar">
          <Search size={14} color="var(--text-3)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <User size={36} color="var(--border2)" />
            <div style={{ fontWeight: 600 }}>No clients found</div>
            <div style={{ fontSize: 13 }}>Add your first client to get started</div>
            <button className="btn btn-primary" onClick={() => setModal('new')}>
              <Plus size={14} /> Add Client
            </button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Outstanding</th>
                <th style={{ textAlign: 'right' }}>Total Paid</th>
                <th>Since</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 8,
                        background: 'var(--surface2)',
                        display: 'grid', placeItems: 'center',
                        color: 'var(--accent)', flexShrink: 0,
                      }}>
                        {c.type === 'business' ? <Building2 size={15} /> : <User size={15} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                        {c.company && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.company}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {c.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
                          <Mail size={11} /> {c.email}
                        </div>
                      )}
                      {c.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
                          <Phone size={11} /> {c.phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${c.type === 'business' ? 'badge-blue' : c.type === 'government' ? 'badge-amber' : 'badge-gray'}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className="td-mono" style={{ textAlign: 'right' }}>
                    {getClientOutstanding(c.id) > 0 ? (
                      <div>
                        <div style={{ color: 'var(--amber, #f59e0b)', fontWeight: 600 }}>
                          {fmt(getClientOutstanding(c.id), settings.currency)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                          {getClientUnpaidInvoices(c.id).length} unpaid
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td className="td-mono" style={{ textAlign: 'right' }}>{fmt(getClientTotal(c.id), settings.currency)}</td>
                  <td className="td-mono">{fmtDate(c.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => setModal(c)} title="Edit"><Pencil size={14} /></button>
                      <button className="icon-btn" onClick={() => deleteClient(c.id)} title="Delete" style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ClientModal
          client={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={form => {
            if (modal === 'new') addClient(form)
            else updateClient(modal.id, form)
            setModal(null)
          }}
        />
      )}
    </div>
  )
}
