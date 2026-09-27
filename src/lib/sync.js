import { supabase } from './supabase'
import { db } from './db'
import { toDb, toBillDb, fromDb } from './caseConvert'
import { showToast } from './toast'

// local Dexie table name -> { remote table name, primary key field, toDb fn }
const TABLES = {
  accounts: { remote: 'accounts', pk: 'id', toDb },
  clients: { remote: 'clients', pk: 'id', toDb },
  vouchers: { remote: 'vouchers', pk: 'id', toDb },
  bills: { remote: 'bills', pk: 'id', toDb: toBillDb },
  templates: { remote: 'voucher_templates', pk: 'id', toDb },
  settings: { remote: 'settings', pk: 'userId', toDb },
  menuItems: { remote: 'menu_items', pk: 'id', toDb },
  posSales: { remote: 'pos_sales', pk: 'id', toDb },
  rawMaterials: { remote: 'raw_materials', pk: 'id', toDb },
  rawMaterialEntries: { remote: 'raw_material_entries', pk: 'id', toDb },
  products: { remote: 'products', pk: 'id', toDb },
  assemblyItems: { remote: 'assembly_items', pk: 'id', toDb },
  productionEntries: { remote: 'production_entries', pk: 'id', toDb },
  invoices: { remote: 'invoices', pk: 'id', toDb },
  invoiceItems: { remote: 'invoice_items', pk: 'id', toDb },
}

let syncing = false
let userId = null
const listeners = new Set()
function emitStatus(status) { for (const l of listeners) l(status) }
export function onSyncStatusChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

// ---- writes (called by the store, always local-first) ----

export async function queueWrite(table, op, record, { silent = false } = {}) {
  const cfg = TABLES[table]
  const pkVal = record[cfg.pk]
  const now = new Date().toISOString()

  if (op === 'delete') {
    await db[table].update(pkVal, { _dirty: 1, _deleted: 1, updatedAt: now })
  } else {
    await db[table].put({ ...record, updatedAt: now, _dirty: 1, _deleted: 0 })
  }
  await db.outbox.add({ table, recordId: pkVal, op, payload: op === 'delete' ? null : { ...record, updatedAt: now }, ts: now, userId })

  if (navigator.onLine) {
    syncNow()
  } else if (!silent) {
    showToast("Saved offline — this will sync automatically once you're back online.", 'offline-save')
  }
}

// ---- pull: fetch remote state, merge with last-write-wins ----

async function pullTable(table) {
  const cfg = TABLES[table]
  const { data, error } = await supabase.from(cfg.remote).select('*')
  if (error) throw error

  for (const row of data) {
    const remote = fromDb(row)
    const pkVal = remote[cfg.pk]
    const local = await db[table].get(pkVal)

    if (!local) {
      await db[table].put({ ...remote, _dirty: 0, _deleted: 0 })
      continue
    }
    if (!local._dirty) {
      await db[table].put({ ...remote, _dirty: 0, _deleted: 0 })
      continue
    }
    // local has a pending edit — last-write-wins on updatedAt
    if (new Date(remote.updatedAt) > new Date(local.updatedAt)) {
      await db[table].put({ ...remote, _dirty: 0, _deleted: 0 })
      await db.outbox.where({ table, recordId: pkVal }).delete()
      await db.conflicts.add({
        table, recordId: pkVal, ts: new Date().toISOString(),
        message: local._deleted
          ? `Your deletion was undone — a newer change came in from another device.`
          : `Your offline edit was overwritten by a newer change from another device.`,
      })
    }
    // else: local edit is newer, keep it dirty — push phase will send it
  }

  // rows deleted on the server that we still have locally (and aren't
  // ourselves trying to delete) should disappear locally too
  const remoteIds = new Set(data.map(r => r[cfg.pk === 'userId' ? 'user_id' : 'id']))
  const localRows = await db[table].toArray()
  for (const row of localRows) {
    const pkVal = row[cfg.pk]
    if (!remoteIds.has(pkVal) && !row._dirty) {
      await db[table].delete(pkVal)
    }
  }
}

// ---- push: replay the outbox in order ----

// Postgres error codes that mean "this will never succeed, no matter how
// many times it's retried" — a foreign key pointing at something that
// got deleted, a uniqueness clash, a NOT NULL violation, malformed data.
// These are different in kind from a network drop or an expired session,
// which genuinely can succeed on the next attempt. Without this
// distinction, a single bad record sitting at the front of the queue
// would retry-and-fail forever, permanently blocking every healthy
// record queued behind it — not just itself.
const PERMANENT_ERROR_CODES = new Set([
  '23503', // foreign_key_violation
  '23505', // unique_violation
  '23502', // not_null_violation
  '23514', // check_violation
  '22P02', // invalid_text_representation
])

function isPermanentError(error) {
  return !!(error && error.code && PERMANENT_ERROR_CODES.has(error.code))
}

async function pushOutbox() {
  const entries = await db.outbox.where('userId').equals(userId).sortBy('seq')
  for (const entry of entries) {
    const cfg = TABLES[entry.table]
    try {
      if (entry.op === 'insert') {
        const { error, data } = await supabase.from(cfg.remote)
          .upsert(cfg.toDb(entry.payload, 'insert')).select()
        if (error) throw error
        if (data && data[0]) {
          await db[entry.table].put({ ...fromDb(data[0]), _dirty: 1, _deleted: 0 })
        }
      } else if (entry.op === 'update') {
        const filterCol = cfg.pk === 'userId' ? 'user_id' : 'id'
        const { error, data } = await supabase.from(cfg.remote)
          .update(cfg.toDb(entry.payload, 'update')).eq(filterCol, entry.recordId).select()
        if (error) throw error
        if (!data || data.length === 0) {
          // record no longer exists remotely (deleted elsewhere) — drop it locally
          await db[entry.table].delete(entry.recordId)
          await db.conflicts.add({
            table: entry.table, recordId: entry.recordId, ts: new Date().toISOString(),
            message: `Your offline edit was discarded — this record was deleted on another device.`,
          })
        }
      } else if (entry.op === 'delete') {
        const filterCol = cfg.pk === 'userId' ? 'user_id' : 'id'
        const { error } = await supabase.from(cfg.remote).delete().eq(filterCol, entry.recordId)
        if (error) throw error
      }
    } catch (err) {
      if (!isPermanentError(err)) {
        // Network drop, expired session, or anything else that might
        // genuinely succeed later — stop here exactly as before.
        // Remaining entries (including this one) stay queued in order
        // and retry on the next sync pass.
        throw err
      }
      // A permanent failure — retrying this exact entry forever would
      // only block every healthy write queued behind it. Surface it so
      // it's visible (not silently dropped) and remove it from the
      // outbox so the rest of the queue can keep moving. The local
      // record stays marked dirty rather than being deleted outright —
      // nothing disappears, it just stops trying to auto-sync this one
      // change until someone looks at it.
      console.error(`Sync: permanent error on ${entry.table} (${entry.op}), skipping this entry:`, err.message)
      await db.conflicts.add({
        table: entry.table, recordId: entry.recordId, ts: new Date().toISOString(),
        message: `A change to this record couldn't be saved (${err.message || 'data conflict'}) — it's still saved on this device, but needs another look before it'll sync.`,
      })
      await db.outbox.delete(entry.seq)
      continue
    }

    await db.outbox.delete(entry.seq)
    const remaining = await db.outbox.where({ table: entry.table, recordId: entry.recordId }).count()
    if (remaining === 0) {
      const row = await db[entry.table].get(entry.recordId)
      if (row) {
        if (row._deleted) await db[entry.table].delete(entry.recordId)
        else await db[entry.table].update(entry.recordId, { _dirty: 0 })
      }
    }
  }
}

export async function syncNow() {
  if (!userId || syncing || !navigator.onLine) return
  syncing = true
  emitStatus('syncing')
  let hadError = false
  // Each table pulled independently — a hiccup on one table (a
  // permissions issue, a transient error specific to that table)
  // shouldn't prevent every OTHER table from pulling, and shouldn't
  // prevent push from running at all this cycle. Before this, a single
  // failing table silently stalled the entire sync pass, pull and push
  // alike, every 30 seconds, until that one table recovered.
  for (const table of Object.keys(TABLES)) {
    try {
      await pullTable(table)
    } catch (e) {
      hadError = true
      console.error(`Sync: pull failed for ${table}, will retry next pass:`, e.message)
    }
  }
  try {
    await pushOutbox()
  } catch (e) {
    hadError = true
    console.error('Sync: push failed, will retry:', e.message)
  }
  emitStatus(hadError ? 'error' : 'idle')
  syncing = false
}

let intervalHandle = null
export function initSync(uid) {
  userId = uid
  window.addEventListener('online', syncNow)
  if (!intervalHandle) intervalHandle = setInterval(syncNow, 30000)
}
export function stopSync() {
  userId = null
  window.removeEventListener('online', syncNow)
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null }
}

export async function pendingCount() {
  if (!userId) return 0
  return db.outbox.where('userId').equals(userId).count()
}
