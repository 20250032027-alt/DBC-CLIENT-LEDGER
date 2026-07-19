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

// v2: outbox entries are now tagged with the account they belong to. Without
// this, switching accounts on the same device/browser (e.g. an admin using
// "Manage Ledger" on different clients) would leave one account's unsynced
// writes sitting in the same local queue as another's — and the next sync
// would try to push them all under whichever account happens to be logged
// in, failing with a row-level-security error since the data doesn't belong
// to that account. Pre-existing entries from before this fix have no userId
// and are simply never matched/retried again — harmless, inert leftovers
// rather than a recurring error. Use "Reset This Device" in Settings to
// clear them out if desired.
db.version(2).stores({
  outbox: '++seq, table, recordId, ts, userId',
})

export async function clearLocalDb() {
  await Promise.all(db.tables.map(t => t.clear()))
}
