import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { queueWrite, initSync, stopSync, onSyncStatusChange, pendingCount, syncNow } from '../lib/sync'
import { DEFAULT_ACCOUNTS } from './defaultAccounts'
import { nextVoucherNumber, nextBillNumber, nextPosSaleNumber, generateSalt, hashSecret } from '../utils'

const defaultSettings = {
  company: 'My Company',
  address: '',
  tin: '',
  logo: '',
  deletePassword: '', // legacy plaintext — no longer written to; auto-migrated to hash on load, see Settings.jsx
  deletePasswordHash: '',
  pwSalt: '',
  email: '',
  approved: false,
  currency: 'PHP',
  // Tax scheme is a company-level setting, not a per-voucher choice — under
  // BIR rules a business is registered as either VAT or Non-VAT/Percentage
  // Tax, not switchable transaction by transaction.
  taxScheme: 'vat', // 'vat' | 'percentage'
  vatRate: 12,
  percentageTaxRate: 3,
  // Team Members: [{ id, name, passwordHash, isAdmin, permissions: { [pageId]: true } }]
  // Passwords are salted-SHA256-hashed (see hashSecret/verifySecret in
  // utils.js), never stored in plain text. See canEdit logic in App.jsx
  // for how this gets enforced. Empty array = the
  // feature is unused and nobody sees any change from today's behavior.
  teamMembers: [],
  // Lets the Help Assistant chatbot see real voucher/account figures
  // (balances, individual debit/credit entries) rather than just
  // explaining how the app works in the abstract. Account-wide, not
  // per Team Member — see Settings > Help Assistant.
  helpAssistantDataEnabled: true,
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
  const [menuItems, setMenuItems] = useState([])
  const [posSales, setPosSales] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [rawMaterialEntries, setRawMaterialEntries] = useState([])
  const [products, setProducts] = useState([])
  const [assemblyItems, setAssemblyItems] = useState([])
  const [productionEntries, setProductionEntries] = useState([])
  const [invoices, setInvoices] = useState([])
  const [invoiceItems, setInvoiceItems] = useState([])
  const [settings, setSettings] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [pending, setPending] = useState(0)
  const [conflicts, setConflicts] = useState([])

  const refreshFromLocal = useCallback(async () => {
    const [accData, cliData, vouData, billData, tplData, menuData, saleData, rmData, rmeData, prodData, asmData, peData, invData, iiData, setRow, conflictRows] = await Promise.all([
      liveRows('accounts'), liveRows('clients'), liveRows('vouchers'),
      liveRows('bills'), liveRows('templates'),
      liveRows('menuItems'), liveRows('posSales'),
      liveRows('rawMaterials'), liveRows('rawMaterialEntries'),
      liveRows('products'), liveRows('assemblyItems'),
      liveRows('productionEntries'),
      liveRows('invoices'), liveRows('invoiceItems'),
      userId ? db.settings.get(userId) : null,
      db.conflicts.orderBy('ts').reverse().limit(20).toArray(),
    ])
    setAccounts(sortByCode(accData))
    setClients(cliData)
    setVouchers(vouData)
    setBills(billData)
    setTemplates(tplData)
    setMenuItems(menuData)
    setPosSales(saleData)
    setRawMaterials(rmData)
    setRawMaterialEntries(rmeData)
    setProducts(prodData)
    setAssemblyItems(asmData)
    setProductionEntries(peData)
    setInvoices(invData)
    setInvoiceItems(iiData)
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
      } else {
        // One-time, automatic migration: hash any legacy plaintext
        // deletePassword or team-member `password` field left over from
        // before hashing was added, then remove the plaintext. Runs here
        // (before any UI, including the team-member identification
        // screen, ever reads a password) rather than only when someone
        // happens to visit Settings — otherwise a not-yet-migrated
        // password could get checked against the wrong thing. No-ops
        // instantly once everything's already hashed.
        const needsDeleteMigration = existingSettings.deletePassword && !existingSettings.deletePasswordHash
        const membersNeedingMigration = (existingSettings.teamMembers || []).filter(m => m.password && !m.passwordHash)
        if (needsDeleteMigration || membersNeedingMigration.length > 0) {
          const salt = existingSettings.pwSalt || generateSalt()
          const patch = { pwSalt: salt }
          if (needsDeleteMigration) {
            patch.deletePasswordHash = await hashSecret(existingSettings.deletePassword, salt)
            patch.deletePassword = ''
          }
          if (membersNeedingMigration.length > 0) {
            patch.teamMembers = await Promise.all((existingSettings.teamMembers || []).map(async m => {
              if (m.password && !m.passwordHash) {
                const passwordHash = await hashSecret(m.password, salt)
                const { password, ...rest } = m
                return { ...rest, passwordHash }
              }
              return m
            }))
          }
          await queueWrite('settings', 'update', { ...existingSettings, ...patch }, { silent: true })
        }
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

  // ---- Voucher attachments (receipts, etc.) ----
  // Unlike everything else in this store, these talk to Supabase Storage
  // directly rather than going through the offline queue — a file upload
  // isn't a small JSON write that can wait quietly in IndexedDB until
  // reconnection, it needs a real connection right now. If the user is
  // offline, these will simply fail with a clear error rather than
  // pretending to queue something that can't actually be queued this way.
  const ATTACHMENTS_BUCKET = 'voucher-attachments'

  async function uploadVoucherAttachment(voucherId, file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `${userId}/${voucherId}/${Date.now()}-${safeName}`
    const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file)
    if (error) throw error

    const attachment = {
      id: crypto.randomUUID(),
      name: file.name,
      path,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }
    const existing = await db.vouchers.get(voucherId)
    const attachments = [...(existing?.attachments || []), attachment]
    await updateVoucher(voucherId, { attachments })
    return attachment
  }

  async function getVoucherAttachmentUrl(path) {
    // Signed URL, not a public one — the bucket is private, matching every
    // other table's owner-only access. Expires in an hour; if someone
    // holds the tab open longer than that and clicks again, a fresh one
    // gets generated, no different from any other "view" action.
    const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  }

  async function deleteVoucherAttachment(voucherId, attachmentId) {
    const existing = await db.vouchers.get(voucherId)
    if (!existing) return
    const target = (existing.attachments || []).find(a => a.id === attachmentId)
    if (!target) return
    const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([target.path])
    if (error) throw error
    const attachments = (existing.attachments || []).filter(a => a.id !== attachmentId)
    await updateVoucher(voucherId, { attachments })
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

  // ---- Point of Sale ----
  async function addMenuItem(item) {
    const id = crypto.randomUUID()
    const rec = { id, userId, createdAt: new Date().toISOString(), active: true, ...item }
    await queueWrite('menuItems', 'insert', rec)
    await refreshFromLocal()
    return id
  }
  async function updateMenuItem(id, patch) {
    const existing = await db.menuItems.get(id)
    if (!existing) { fail(null, 'Could not update menu item'); return }
    await queueWrite('menuItems', 'update', { ...existing, ...patch, id })
    await refreshFromLocal()
  }
  async function deleteMenuItem(id) {
    await queueWrite('menuItems', 'delete', { id })
    await refreshFromLocal()
  }

  // Rings up a sale: saves the POS-specific record (what was ordered, how
  // it was paid) AND auto-posts the matching accounting voucher in the
  // same call — same reasoning as addBill above, just immediate-payment
  // instead of invoice-then-collect. Dr Cash for the full total; Cr Sales
  // Revenue for the subtotal; Cr VAT Payable for the tax portion, only if
  // there's actually tax to record (a Percentage-Tax business or a
  // non-taxed sale wouldn't have this line).
  async function addPosSale(sale) {
    const id = crypto.randomUUID()
    const date = sale.date || new Date().toISOString().slice(0, 10)
    const number = nextPosSaleNumber(date, posSales)

    // Card payments post to the same Cash account as cash payments for
    // now — a reasonable simplification for a small business, but if a
    // separate bank/card clearing account is ever wanted, this is the
    // one line to change.
    const cashAccount = coaName('Cash', null, accounts)
    const revAccount = coaName('Sales Revenue', 'Service Revenue', accounts)
    const vatAccount = coaName('VAT Payable', null, accounts)

    const entries = [
      { account: cashAccount, description: `POS sale ${number}`, debit: sale.total, credit: 0 },
      { account: revAccount, description: `POS sale ${number}`, debit: 0, credit: sale.subtotal },
    ]
    if (sale.tax > 0 && vatAccount) {
      entries.push({ account: vatAccount, description: `VAT on POS sale ${number}`, debit: 0, credit: sale.tax })
    }

    await insertVoucherRecord({
      type: 'sales',
      number: nextVoucherNumber('sales', date, vouchers),
      date,
      memo: `POS sale ${number}`,
      reference: number,
      entries,
    }, { silent: true })

    const rec = {
      id, userId, createdAt: new Date().toISOString(), number, date,
      items: sale.items, subtotal: sale.subtotal, tax: sale.tax, total: sale.total,
      paymentMethod: sale.paymentMethod || 'cash',
      reference: number, // the voucher was posted with reference = this same number, so this ties back to it
    }
    await queueWrite('posSales', 'insert', rec)
    await refreshFromLocal()
    return id
  }

  // ---- Raw Materials ----
  // Current stock isn't stored as a running total anywhere — it's always
  // computed fresh as opening_stock + the sum of every entry, the same
  // way the original app did it. That avoids a stored total ever quietly
  // drifting out of sync with the entries that are supposed to explain it.
  async function addRawMaterial(material) {
    const id = crypto.randomUUID()
    const rec = { id, userId, createdAt: new Date().toISOString(), unit: 'kg', openingStock: 0, ...material }
    await queueWrite('rawMaterials', 'insert', rec)
    await refreshFromLocal()
    return id
  }
  async function updateRawMaterial(id, patch) {
    const existing = await db.rawMaterials.get(id)
    if (!existing) { fail(null, 'Could not update raw material'); return }
    await queueWrite('rawMaterials', 'update', { ...existing, ...patch, id })
    await refreshFromLocal()
  }
  async function deleteRawMaterial(id) {
    // Mirrors the original app's warning: this also orphans any entries
    // and assembly recipe lines pointing at this material. The app
    // doesn't cascade-delete those automatically (same as before) — they
    // just stop resolving to a real material.
    await queueWrite('rawMaterials', 'delete', { id })
    await refreshFromLocal()
  }

  async function addRawMaterialEntry(entry) {
    const id = crypto.randomUUID()
    const rec = {
      id, userId, createdAt: new Date().toISOString(),
      entryType: 'intake', date: new Date().toISOString().slice(0, 10),
      ...entry,
    }
    await queueWrite('rawMaterialEntries', 'insert', rec)
    await refreshFromLocal()
    return id
  }
  async function updateRawMaterialEntry(id, patch) {
    const existing = await db.rawMaterialEntries.get(id)
    if (!existing) { fail(null, 'Could not update entry'); return }
    await queueWrite('rawMaterialEntries', 'update', { ...existing, ...patch, id })
    await refreshFromLocal()
  }
  async function deleteRawMaterialEntry(id) {
    await queueWrite('rawMaterialEntries', 'delete', { id })
    await refreshFromLocal()
  }

  // ---- Products ----
  async function addProduct(product) {
    const id = crypto.randomUUID()
    const rec = { id, userId, createdAt: new Date().toISOString(), unit: 'pc', openingStock: 0, ...product }
    await queueWrite('products', 'insert', rec)
    await refreshFromLocal()
    return id
  }
  async function updateProduct(id, patch) {
    const existing = await db.products.get(id)
    if (!existing) { fail(null, 'Could not update product'); return }
    await queueWrite('products', 'update', { ...existing, ...patch, id })
    await refreshFromLocal()
  }
  async function deleteProduct(id) {
    // Same as the original app: doesn't cascade-clean assembly recipe
    // rows pointing at this product — they just stop resolving to a real
    // product, same tradeoff as deleting a raw material.
    await queueWrite('products', 'delete', { id })
    await refreshFromLocal()
  }

  // ---- Assembly (bill of materials) ----
  // Saving a recipe REPLACES the full set of ingredient rows for that
  // product — delete everything currently on file for it, then insert
  // the new set in one go. Matches the original app's approach: simpler
  // and less error-prone than trying to diff and patch individual rows.
  async function saveAssemblyRecipe(productId, rows) {
    const existing = assemblyItems.filter(a => a.productId === productId)
    for (const row of existing) {
      await queueWrite('assemblyItems', 'delete', { id: row.id })
    }
    for (const row of rows) {
      const id = crypto.randomUUID()
      await queueWrite('assemblyItems', 'insert', {
        id, userId, createdAt: new Date().toISOString(),
        productId, rawMaterialId: row.rawMaterialId, quantityPerUnit: row.quantityPerUnit,
      })
    }
    await refreshFromLocal()
  }

  // ---- Production ----
  // Logging a production batch auto-consumes the product's recipe by
  // inserting negative raw_material_entries rows (entry_type =
  // 'consumption'), tagged with productionEntryId so they can be found
  // again for edits/deletes. Adjustment entries (is_adjustment: true)
  // skip this entirely — a manual finished-goods correction doesn't
  // consume any raw material.
  async function consumeRawMaterialsForProduction(productionEntryId, productId, quantity, date) {
    const recipe = assemblyItems.filter(a => a.productId === productId)
    for (const r of recipe) {
      await queueWrite('rawMaterialEntries', 'insert', {
        id: crypto.randomUUID(), userId, createdAt: new Date().toISOString(),
        rawMaterialId: r.rawMaterialId,
        quantity: -(Number(r.quantityPerUnit) * Number(quantity)),
        date, batchNotes: 'Auto-consumed for production batch',
        entryType: 'consumption', productionEntryId,
      })
    }
  }

  async function removeConsumptionEntriesFor(productionEntryId) {
    const toRemove = rawMaterialEntries.filter(e => e.productionEntryId === productionEntryId && e.entryType === 'consumption')
    for (const e of toRemove) {
      await queueWrite('rawMaterialEntries', 'delete', { id: e.id })
    }
  }

  async function addProductionEntry(entry) {
    const id = crypto.randomUUID()
    const rec = {
      id, userId, createdAt: new Date().toISOString(),
      isAdjustment: false, batchNotes: null,
      ...entry,
    }
    await queueWrite('productionEntries', 'insert', rec)
    if (!rec.isAdjustment) {
      await consumeRawMaterialsForProduction(id, rec.productId, rec.quantity, rec.date)
    }
    await refreshFromLocal()
    return id
  }
  async function updateProductionEntry(id, patch) {
    const existing = await db.productionEntries.get(id)
    if (!existing) { fail(null, 'Could not update production entry'); return }
    const updated = { ...existing, ...patch, id }
    await queueWrite('productionEntries', 'update', updated)
    if (!updated.isAdjustment) {
      // Recipe or quantity may have changed — clear the old consumption
      // entries this run created and recompute from scratch, same as the
      // original app.
      await removeConsumptionEntriesFor(id)
      await consumeRawMaterialsForProduction(id, updated.productId, updated.quantity, updated.date)
    }
    await refreshFromLocal()
  }
  async function deleteProductionEntry(id) {
    // Fixed from the original app: also clean up the raw material this
    // batch consumed, not just the production_entries row — otherwise
    // stock stays permanently reduced for a batch that no longer exists.
    await removeConsumptionEntriesFor(id)
    await queueWrite('productionEntries', 'delete', { id })
    await refreshFromLocal()
  }

  // ---- Sales (invoices) ----
  // Only Cash and Credit exist as payment types here — the original
  // app's third type, 'Consign', drives a whole separate FIFO settlement
  // system (Countering) that isn't ported. DBC-specific addition: unlike
  // the original app (which never touched accounting at all), creating an
  // invoice here auto-posts a matching voucher — Dr Cash for Cash, Dr
  // Accounts Receivable for Credit; Cr Sales Revenue for the total —
  // same "auto-post on create only" reasoning addBill already uses,
  // not on every subsequent edit.
  async function addSalesInvoice(invoice, items) {
    const id = crypto.randomUUID()
    const date = invoice.date || new Date().toISOString().slice(0, 10)
    const total = items.reduce((s, it) => s + Number(it.amount || 0), 0)

    let reference = null
    if (total > 0) {
      const cashAccount = coaName('Cash', null, accounts)
      const arAccount = coaName('Accounts Receivable', null, accounts)
      const revAccount = coaName('Sales Revenue', 'Service Revenue', accounts)
      const debitAccount = invoice.paymentType === 'Credit' ? (arAccount || cashAccount) : cashAccount
      const number = nextVoucherNumber('sales', date, vouchers)
      reference = number
      await insertVoucherRecord({
        type: 'sales',
        number,
        date,
        memo: `Sales invoice${invoice.referenceNo ? ` ${invoice.referenceNo}` : ''}${invoice.client ? ` — ${invoice.client}` : ''}`,
        reference: number,
        entries: [
          { account: debitAccount, description: 'Sales invoice', debit: total, credit: 0 },
          { account: revAccount, description: 'Sales invoice', debit: 0, credit: total },
        ],
      }, { silent: true })
    }

    const invRec = { id, userId, createdAt: new Date().toISOString(), reference, ...invoice, date }
    await queueWrite('invoices', 'insert', invRec)
    for (const item of items) {
      await queueWrite('invoiceItems', 'insert', {
        id: crypto.randomUUID(), userId, createdAt: new Date().toISOString(),
        invoiceId: id, productId: item.productId, quantity: item.quantity, amount: item.amount ?? null,
      })
    }
    await refreshFromLocal()
    return id
  }

  async function updateSalesInvoice(id, patch, items) {
    const existing = await db.invoices.get(id)
    if (!existing) { fail(null, 'Could not update invoice'); return }
    await queueWrite('invoices', 'update', { ...existing, ...patch, id })

    if (items) {
      const oldItems = invoiceItems.filter(it => it.invoiceId === id)
      for (const it of oldItems) await queueWrite('invoiceItems', 'delete', { id: it.id })
      for (const item of items) {
        await queueWrite('invoiceItems', 'insert', {
          id: crypto.randomUUID(), userId, createdAt: new Date().toISOString(),
          invoiceId: id, productId: item.productId, quantity: item.quantity, amount: item.amount ?? null,
        })
      }
    }
    await refreshFromLocal()
  }

  async function deleteSalesInvoice(id) {
    const items = invoiceItems.filter(it => it.invoiceId === id)
    for (const it of items) await queueWrite('invoiceItems', 'delete', { id: it.id })
    await queueWrite('invoices', 'delete', { id })
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

  // "Use Starter Chart of Accounts" above only ever shows up when someone
  // has zero accounts — so if the starter pack itself later gets a new
  // account added to it (like Withholding Tax Receivable was), anyone who
  // already ran the starter pack before that has no way to pick up the
  // addition except adding it by hand. This adds just whatever starter
  // accounts aren't already present by name, leaving everything else
  // (including any accounts the user renamed, edited, or added
  // themselves) completely untouched.
  function missingStarterAccounts() {
    const existingNames = new Set(accounts.map(a => (a.name || '').trim().toLowerCase()))
    return DEFAULT_ACCOUNTS.filter(acc => !existingNames.has(acc.name.trim().toLowerCase()))
  }

  async function addMissingStarterAccounts() {
    const missing = missingStarterAccounts()
    for (const acc of missing) {
      const id = crypto.randomUUID()
      await queueWrite('accounts', 'insert', { id, userId, createdAt: new Date().toISOString(), ...acc })
    }
    await refreshFromLocal()
    return missing.length
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
      menuItems, posSales,
      rawMaterials, rawMaterialEntries,
      products, assemblyItems,
      productionEntries,
      invoices, invoiceItems,
      syncStatus, pending, conflicts, clearConflicts,
      clearError: () => setError(null),
      refresh,
      addClient, updateClient, deleteClient,
      addVoucher, updateVoucher, deleteVoucher,
      uploadVoucherAttachment, getVoucherAttachmentUrl, deleteVoucherAttachment,
      addBill, updateBill, deleteBill,
      addAccount, updateAccount, deleteAccount, seedDefaultAccounts,
      missingStarterAccounts, addMissingStarterAccounts,
      addTemplate, deleteTemplate,
      addMenuItem, updateMenuItem, deleteMenuItem, addPosSale,
      addRawMaterial, updateRawMaterial, deleteRawMaterial,
      addRawMaterialEntry, updateRawMaterialEntry, deleteRawMaterialEntry,
      addProduct, updateProduct, deleteProduct, saveAssemblyRecipe,
      addProductionEntry, updateProductionEntry, deleteProductionEntry,
      addSalesInvoice, updateSalesInvoice, deleteSalesInvoice,
      updateSettings, deleteAllData,
    }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  return useContext(StoreContext)
}
