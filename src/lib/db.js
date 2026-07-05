import Dexie from 'dexie'

// Local mirror of the Supabase tables, plus two bookkeeping tables:
//   outbox    — ordered queue of writes made while offline (or optimistically
//               while online, then cleared once confirmed)
//   conflicts — human-readable log of any local edit that got overwritten by
//               a newer edit from another device. Never silently drop this;
//               surface it.
export const db = new Dexie('dbc-client-ledger')

db.version(1).stores({
  accounts: 'id, userId, updatedAt, _dirty',
  clients: 'id, userId, updatedAt, _dirty',
  vouchers: 'id, userId, updatedAt, _dirty',
  bills: 'id, userId, updatedAt, _dirty',
  templates: 'id, userId, updatedAt, _dirty',
  settings: 'userId, updatedAt, _dirty',
  outbox: '++seq, table, recordId, ts',
  conflicts: '++id, table, recordId, ts',
})

export async function clearLocalDb() {
  await Promise.all(db.tables.map(t => t.clear()))
}
