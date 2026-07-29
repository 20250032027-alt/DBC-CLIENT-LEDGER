import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { db } from '../lib/db'
import { queueWrite, initSync, stopSync, onSyncStatusChange, pendingCount, syncNow } from '../lib/sync'
import { DEFAULT_ACCOUNTS } from './defaultAccounts'
import { nextVoucherNumber, nextBillNumber } from '../utils'

const defaultSettings = {
  company: 'My Company',
  address: '',
  tin: '',
  logo: '',
  deletePassword: '',
  email: '',
  approved: false,
  currency: 'PHP',
  // Tax scheme is a company-level setting, not a per-voucher choice — under
  // BIR rules a business is registered as either VAT or Non-VAT/Percentage
  // Tax, not switchable transaction by transaction.
  taxScheme: 'vat', // 'vat' | 'percentage'
  vatRate: 12,
  percentageTaxRate: 3,
  // Team Members: [{ id, name, password, isAdmin, permissions: { [pageId]: true } }]
  // See useTeam() in App.jsx for how this gets enforced. Empty array = the
  // feature is unused and nobody sees any change from today's behavior.
  teamMembers: [],
}

function sortByCode(list) {
  return [...list].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }))
}

function liveRows(table) {
  // exclude local tombstones (queued deletes not yet confirmed)
  return db[table].filter(r => !r._deleted).toArray()
}

const StoreContext = createContext(null)

export function StoreProvider({ children, userId, initialCompany, userEmail }) {
  const [clients, setClients] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [bills, setBills] = useState([])
  const [accounts, setAccounts] = useState([])
  const [templates, setTemplates] = useState([])
  const [settings, setSettings] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [pending, setPending] = useState(0)
  const [conflicts, setConflicts] = useState([])

  const refreshFromLocal = useCallback(async () => {
    const [accData, cliData, vouData, billData, tplData, setRow, conflictRows] = await Promise.all([
      liveRows('accounts'), liveRows('clients'), liveRows('vouchers'),
      liveRows('bills'), liveRows('templates'),
      userId ? db.settings.get(userId) : null,
      db.conflicts.orderBy('ts').reverse().limit(20).toArray(),
    ])
    setAccounts(sortByCode(accData))
    setClients(cliData)
    setVouchers(vouData)
    setBills(billData)
    setTemplates(tplData)
    if (setRow) setSettings({ ...defaultSettings, ...setRow })
    setConflicts(conflictRows)
    setPending(await pendingCount())
  }, [userId])

  // One-time fix for records saved before voucher/bill auto-numbering
  // existed: `number` is NOT NULL in the database, so any record saved with
  // no number was silently failing to sync (and retrying forever). This
  // assigns one so those old records can finally reach the cloud.
  async function backfillMissingNumbers() {
    const allV = await db.vouchers.where('userId').equals(userId).toArray()
    const missingV = allV.filter(v => !v.number && !v._deleted)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    let pool = allV.filter(v => v.number)
    for (const v of missingV) {
      const number = nextVoucherNumber(v.type, v.date || v.createdAt, pool)
      pool = [...pool, { ...v, number }]
      await queueWrite('vouchers', 'update', { ...v, number }, { silent: true })
    }

    const allB = await db.bills.where('userId').equals(userId).toArray()
    const missingB = allB.filter(b => !b.number && !b._deleted)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    let poolB = allB.filter(b => b.number)
    for (const b of missingB) {
      const number = nextBillNumber(b.date || b.createdAt, poolB)
      poolB = [...poolB, { ...b, number }]
      await queueWrite('bills', 'update', { ...b, number }, { silent: true })
    }
  }

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function boot() {
      setLoading(true)
      setError(null)
      await refreshFromLocal()
      if (cancelled) return

      initSync(userId)
      if (navigator.onLine) await syncNow()
      await backfillMissingNumbers()

      // Only bootstrap default settings if there's genuinely no row for this
      // user anywhere — checked AFTER pulling from the server, not before.
      // Checking only the local cache would treat every brand-new device as
      // a brand-new user, even for an account with years of real settings
      // already on the server, and queue a phantom insert that permanently
      // collides with the real row.
      const existingSettings = await db.settings.get(userId)
      if (!existingSettings) {
        const seedSettings = {
          ...defaultSettings,
          ...(initialCompany ? { company: initialCompany } : {}),
          ...(userEmail ? { email: userEmail } : {}),
        }
        await queueWrite('settings', 'insert', { userId, ...seedSettings }, { silent: true })
      }

      await refreshFromLocal()
      if (!cancelled) setLoading(false)
    }
    boot()

    const unsub = onSyncStatusChange(async (status) => {
      setSyncStatus(status)
      await refreshFromLocal()
    })

    return () => { cancelled = true; unsub(); stopSync() }
  }, [userId, refreshFromLocal])

  function refresh() { refreshFromLocal() }
  function fail(e, fallbackMsg) { setError(e?.message || fallbackMsg) }
  function clearConflicts() { db.conflicts.clear(); setConflicts([]) }

  // ---- Clients ----
  async function addClient(client) {
    const id = crypto.randomUUID()
    const rec = { id, userId, createdAt: new Date().toISOString(), ...client }
    await queueWrite('clients', 'insert', rec)
    await refreshFromLocal()
    return id
  }
  async function updateClient(id, patch) {
    const existing = await db.clients.get(id)
    if (!existing) { fail(null, 'Could not update client'); return }
    await queueWrite('clients', 'update', { ...existing, ...patch, id })
    await refreshFromLocal()
  }
  async function deleteClient(id) {
    await queueWrite('clients', 'delete', { id })
    await refreshFromLocal()
  }

  // ---- Vouchers ----
  async function insertVoucherRecord(voucher, opts) {
    const id = crypto.randomUUID()
    const rec = { id, userId, createdAt: new Date().toISOString(), number: null, ...voucher }
    await queueWrite('vouchers', 'insert', rec, opts)
    return id
  }
  async function addVoucher(voucher) {
    const id = await insertVoucherRecord(voucher)
    await refreshFromLocal()
    return id
  }
  async function updateVoucher(id, patch) {
    const existing = await db.vouchers.get(id)
    if (!existing) { fail(null, 'Could not update voucher'); return }
    await queueWrite('vouchers', 'update', { ...existing, ...patch, id })
    await refreshFromLocal()
  }
  async function deleteVoucher(id) {
    await queueWrite('vouchers', 'delete', { id })
    await refreshFromLocal()
  }

  // ---- Bills ----
  function coaName(preferred, fallback, accountList) {
    const match = accountList.find(a => a.name.trim().toLowerCase() === preferred.toLowerCase())
    return match ? match.name : (fallback || preferred)
  }

  async function addBill(bill) {
    const id = crypto.randomUUID()
    const rec = { id, userId, createdAt: new Date().toISOString(), number: null, status: 'unpaid', ...bill }
    await queueWrite('bills', 'insert', rec)

    const arAccount = bill.receivableAccount || coaName('Accounts Receivable', null, accounts)
    const revAccount = bill.revenueAccount || coaName('Service Revenue', 'Sales Revenue', accounts)
    await insertVoucherRecord({
      type: 'general',
      date: bill.date || new Date().toISOString().slice(0, 10),
      memo: `Invoice (pending #) — ${bill.clientName || ''}`,
      reference: null,
      entries: [
        { account: arAccount, description: `Receivable from ${bill.clientName || ''}`, debit: bill.total, credit: 0 },
        { account: revAccount, description: `Revenue for invoice`, debit: 0, credit: bill.total },
      ],
    }, { silent: true })

    await refreshFromLocal()
    return id
  }

  async function updateBill(id, patch) {
    const existing = await db.bills.get(id)
    if (!existing) { fail(null, 'Could not update invoice'); return }
    const updated = { ...existing, ...patch, id }
    await queueWrite('bills', 'update', updated)

    if (patch.status === 'paid' && existing.status !== 'paid') {
      const arAccount = coaName('Accounts Receivable', null, accounts)
      const cashAccount = coaName(patch.cashAccount || 'Cash', null, accounts)
      await insertVoucherRecord({
        type: 'general',
        date: patch.paidDate || new Date().toISOString().slice(0, 10),
        memo: `Collection for ${updated.number || 'invoice'} — ${updated.clientName || ''}`,
        reference: updated.number || null,
        entries: [
          { account: cashAccount, description: `Cash received from ${updated.clientName || ''}`, debit: updated.total, credit: 0 },
          { account: arAccount, description: `Clear receivable`, debit: 0, credit: updated.total },
        ],
      }, { silent: true })
    }
    await refreshFromLocal()
  }
  async function deleteBill(id) {
    await queueWrite('bills', 'delete', { id })
    await refreshFromLocal()
  }

  // ---- Accounts (Chart of Accounts) ----
  async function addAccount(account) {
    const id = crypto.randomUUID()
    const rec = { id, userId, createdAt: new Date().toISOString(), ...account }
    await queueWrite('accounts', 'insert', rec)
    await refreshFromLocal()
    return id
  }
  async function updateAccount(id, patch) {
    const existing = await db.accounts.get(id)
    if (!existing) { fail(null, 'Could not update account'); return }
    await queueWrite('accounts', 'update', { ...existing, ...patch, id })
    await refreshFromLocal()
  }
  async function deleteAccount(id) {
    await queueWrite('accounts', 'delete', { id })
    await refreshFromLocal()
  }
  async function seedDefaultAccounts() {
    for (const acc of DEFAULT_ACCOUNTS) {
      const id = crypto.randomUUID()
      await queueWrite('accounts', 'insert', { id, userId, createdAt: new Date().toISOString(), ...acc })
    }
    await refreshFromLocal()
  }

  // ---- Voucher Templates ----
  async function addTemplate(template) {
    const id = crypto.randomUUID()
    const rec = { id, userId, createdAt: new Date().toISOString(), ...template }
    await queueWrite('templates', 'insert', rec)
    await refreshFromLocal()
    return id
  }
  async function deleteTemplate(id) {
    await queueWrite('templates', 'delete', { id })
    await refreshFromLocal()
  }

  // ---- Settings ----
  async function updateSettings(patch) {
    const next = { ...settings, ...patch, userId }
    await queueWrite('settings', 'update', next)
    await refreshFromLocal()
  }

  // ---- Danger zone ----
  async function deleteAllData() {
    for (const v of vouchers) await queueWrite('vouchers', 'delete', { id: v.id })
    for (const b of bills) await queueWrite('bills', 'delete', { id: b.id })
    for (const a of accounts) await queueWrite('accounts', 'delete', { id: a.id })
    for (const c of clients) await queueWrite('clients', 'delete', { id: c.id })
    await refreshFromLocal()
  }

  return (
    <StoreContext.Provider value={{
      clients, vouchers, bills, accounts, templates, settings, loading, error,
      syncStatus, pending, conflicts, clearConflicts,
      clearError: () => setError(null),
      refresh,
      addClient, updateClient, deleteClient,
      addVoucher, updateVoucher, deleteVoucher,
      addBill, updateBill, deleteBill,
      addAccount, updateAccount, deleteAccount, seedDefaultAccounts,
      addTemplate, deleteTemplate,
      updateSettings, deleteAllData,
    }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  return useContext(StoreContext)
}
