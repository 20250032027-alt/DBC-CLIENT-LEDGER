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

async function pushOutbox() {
  const entries = await db.outbox.where('userId').equals(userId).sortBy('seq')
  // Any error here (network drop, auth expiry, validation failure) propagates
  // up and stops the loop — remaining outbox entries stay queued in order and
  // get retried on the next sync pass rather than being skipped or reordered.
  for (const entry of entries) {
    const cfg = TABLES[entry.table]
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
  try {
    for (const table of Object.keys(TABLES)) await pullTable(table)
    await pushOutbox()
    emitStatus('idle')
  } catch (e) {
    emitStatus('error')
    // eslint-disable-next-line no-console
    console.error('Sync failed, will retry:', e.message)
  } finally {
    syncing = false
  }
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
